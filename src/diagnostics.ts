import { Platform, TFile, normalizePath, type App, type Plugin } from "obsidian";

interface DiagnosticsConfig {
  enabled: boolean;
  sessionId: string;
  version?: string;
}

export interface MemosPlusDiagnosticState {
  currentPage: string;
  currentModal: string;
  inputFocused: boolean;
  inputContentLength: number;
  isRendering: boolean;
  isSaving: boolean;
}

export interface MemosPlusDiagnosticEntry extends MemosPlusDiagnosticState {
  time: string;
  sessionId: string;
  seq: number;
  version: string;
  mobile: boolean;
  event: string;
  detail: Record<string, unknown>;
}

export const MAX_DIAGNOSTIC_ENTRIES = 200;
const DIAGNOSTIC_STORAGE_KEY = "memos-plus-diagnostic-log-v1";
const DIAGNOSTIC_EXPORT_PATH = "Memos Plus Debug Log.md";

let diagnosticsEnabled = false;
let diagnosticsSessionId = "";
let diagnosticsVersion = "";
let diagnosticsSeq = 0;
let diagnosticsStorageLoaded = false;
let viewportLogTimer: number | null = null;
let windowResizeLogTimer: number | null = null;
let diagnosticEntries: MemosPlusDiagnosticEntry[] = [];

const diagnosticState: MemosPlusDiagnosticState = {
  currentPage: "",
  currentModal: "",
  inputFocused: false,
  inputContentLength: 0,
  isRendering: false,
  isSaving: false
};

export const DIAGNOSTIC_EVENT_NAMES = [
  "memos-plus:onload",
  "memos-plus:onunload",
  "view:constructor",
  "view:onOpen",
  "view:onClose",
  "modal:onOpen",
  "modal:onClose",
  "modal:option-click",
  "settings:save",
  "settings:persist",
  "data:load",
  "data:save",
  "view:render",
  "view:render-start",
  "view:render-end",
  "main:render-start",
  "main:render-end",
  "sidebar:render-start",
  "sidebar:render-end",
  "view:refresh",
  "workspace:layout-change",
  "visualViewport:resize",
  "window:resize",
  "input:focus",
  "input:blur",
  "window:error",
  "window:unhandledrejection"
] as const;

export type MemosPlusDiagnosticEvent = (typeof DIAGNOSTIC_EVENT_NAMES)[number] | (string & {});

export function createMemosPlusSessionId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function configureMemosPlusDiagnostics(config: DiagnosticsConfig): void {
  loadPersistedDiagnosticEntries();
  diagnosticsEnabled = config.enabled;
  if (diagnosticsSessionId !== config.sessionId) {
    diagnosticsSeq = 0;
  }
  diagnosticsSessionId = config.sessionId;
  diagnosticsVersion = config.version ?? diagnosticsVersion;
}

export function setMemosPlusDiagnosticState(patch: Partial<MemosPlusDiagnosticState>): void {
  Object.assign(diagnosticState, patch);
}

export function logMemosPlusDiagnostic(event: MemosPlusDiagnosticEvent, detail: Record<string, unknown> = {}): void {
  if (!diagnosticsEnabled) {
    return;
  }
  diagnosticsSeq += 1;
  const entry: MemosPlusDiagnosticEntry = {
    time: new Date().toISOString(),
    sessionId: diagnosticsSessionId,
    seq: diagnosticsSeq,
    version: diagnosticsVersion,
    mobile: Platform.isMobile,
    event,
    ...diagnosticState,
    detail: sanitizeRecord(detail)
  };
  appendDiagnosticEntry(entry);
  console.warn("[Memos Plus diag]", entry);
}

export function getMemosPlusDiagnosticEntries(limit = MAX_DIAGNOSTIC_ENTRIES): MemosPlusDiagnosticEntry[] {
  loadPersistedDiagnosticEntries();
  return diagnosticEntries.slice(-limit);
}

export async function exportMemosPlusDiagnosticLog(app: App, path = DIAGNOSTIC_EXPORT_PATH): Promise<string> {
  const entries = getMemosPlusDiagnosticEntries(MAX_DIAGNOSTIC_ENTRIES);
  const normalizedPath = normalizePath(path);
  const content = formatDiagnosticLog(entries);
  const existing = app.vault.getAbstractFileByPath(normalizedPath);
  if (existing instanceof TFile) {
    await app.vault.modify(existing, content);
    return normalizedPath;
  }
  await app.vault.create(normalizedPath, content);
  return normalizedPath;
}

export function registerMemosPlusDiagnostics(plugin: Plugin, app: App): void {
  setMemosPlusDiagnosticState({ currentPage: getActivePage(app) });
  plugin.registerEvent(
    app.workspace.on("layout-change", () => {
      setMemosPlusDiagnosticState({ currentPage: getActivePage(app) });
      logMemosPlusDiagnostic("workspace:layout-change", {
        memosLeaves: app.workspace.getLeavesOfType("memos-plus-view").length,
        quickInputLeaves: app.workspace.getLeavesOfType("memos-plus-quick-input-view").length
      });
    })
  );

  const handleWindowError = (event: ErrorEvent): void => {
    logMemosPlusDiagnostic("window:error", {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: summarizeError(event.error)
    });
  };
  const handleUnhandledRejection = (event: PromiseRejectionEvent): void => {
    logMemosPlusDiagnostic("window:unhandledrejection", {
      reason: summarizeError(event.reason)
    });
  };
  const handleFocus = (event: FocusEvent): void => logInputFocusEvent("input:focus", event.target);
  const handleBlur = (event: FocusEvent): void => logInputFocusEvent("input:blur", event.target);
  const handleWindowResize = (): void => {
    if (windowResizeLogTimer !== null) {
      return;
    }
    windowResizeLogTimer = window.setTimeout(() => {
      windowResizeLogTimer = null;
      logMemosPlusDiagnostic("window:resize", {
        width: window.innerWidth,
        height: window.innerHeight
      });
    }, 250);
  };

  window.addEventListener("error", handleWindowError);
  window.addEventListener("unhandledrejection", handleUnhandledRejection);
  window.addEventListener("resize", handleWindowResize);
  document.addEventListener("focusin", handleFocus, true);
  document.addEventListener("focusout", handleBlur, true);
  plugin.register(() => {
    window.removeEventListener("error", handleWindowError);
    window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    window.removeEventListener("resize", handleWindowResize);
    document.removeEventListener("focusin", handleFocus, true);
    document.removeEventListener("focusout", handleBlur, true);
    clearViewportLogTimer();
    clearWindowResizeLogTimer();
  });

  const visualViewport = window.visualViewport;
  if (!visualViewport) {
    return;
  }
  const handleViewportChange = (): void => {
    if (viewportLogTimer !== null) {
      return;
    }
    viewportLogTimer = window.setTimeout(() => {
      viewportLogTimer = null;
      logMemosPlusDiagnostic("visualViewport:resize", {
        width: Math.round(visualViewport.width),
        height: Math.round(visualViewport.height),
        offsetTop: Math.round(visualViewport.offsetTop),
        scale: visualViewport.scale
      });
    }, 250);
  };
  visualViewport.addEventListener("resize", handleViewportChange);
  visualViewport.addEventListener("scroll", handleViewportChange);
  plugin.register(() => {
    visualViewport.removeEventListener("resize", handleViewportChange);
    visualViewport.removeEventListener("scroll", handleViewportChange);
  });
}

function appendDiagnosticEntry(entry: MemosPlusDiagnosticEntry): void {
  loadPersistedDiagnosticEntries();
  diagnosticEntries.push(entry);
  if (diagnosticEntries.length > MAX_DIAGNOSTIC_ENTRIES) {
    diagnosticEntries = diagnosticEntries.slice(-MAX_DIAGNOSTIC_ENTRIES);
  }
  persistDiagnosticEntries();
}

function loadPersistedDiagnosticEntries(): void {
  if (diagnosticsStorageLoaded) {
    return;
  }
  diagnosticsStorageLoaded = true;
  try {
    const raw = window.localStorage.getItem(DIAGNOSTIC_STORAGE_KEY);
    if (!raw) {
      return;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return;
    }
    diagnosticEntries = parsed.filter(isDiagnosticEntry).slice(-MAX_DIAGNOSTIC_ENTRIES);
  } catch {
    diagnosticEntries = [];
  }
}

function persistDiagnosticEntries(): void {
  try {
    window.localStorage.setItem(DIAGNOSTIC_STORAGE_KEY, JSON.stringify(diagnosticEntries));
  } catch {
    // Ignore storage quota and private-mode failures; console diagnostics still work.
  }
}

function isDiagnosticEntry(value: unknown): value is MemosPlusDiagnosticEntry {
  if (!value || typeof value !== "object") {
    return false;
  }
  const entry = value as Partial<MemosPlusDiagnosticEntry>;
  return typeof entry.time === "string" && typeof entry.sessionId === "string" && typeof entry.event === "string";
}

function formatDiagnosticLog(entries: MemosPlusDiagnosticEntry[]): string {
  const lastTwenty = entries.slice(-20);
  const lines = [
    "# Memos Plus Debug Log",
    "",
    `- Generated: ${new Date().toISOString()}`,
    `- Entries: ${entries.length}`,
    "",
    "## Last 20 Events",
    ""
  ];
  for (const entry of lastTwenty) {
    lines.push(
      `- ${entry.time} session=${entry.sessionId} seq=${entry.seq} event=${entry.event} page=${entry.currentPage || "-"} modal=${
        entry.currentModal || "-"
      } focused=${entry.inputFocused} inputLen=${entry.inputContentLength} rendering=${entry.isRendering} saving=${entry.isSaving} detail=${safeJson(
        entry.detail
      )}`
    );
  }
  lines.push("", "## Full Entries", "", "```json", JSON.stringify(entries, null, 2), "```", "");
  return lines.join("\n");
}

function clearViewportLogTimer(): void {
  if (viewportLogTimer === null) {
    return;
  }
  window.clearTimeout(viewportLogTimer);
  viewportLogTimer = null;
}

function clearWindowResizeLogTimer(): void {
  if (windowResizeLogTimer === null) {
    return;
  }
  window.clearTimeout(windowResizeLogTimer);
  windowResizeLogTimer = null;
}

function logInputFocusEvent(event: "input:focus" | "input:blur", target: EventTarget | null): void {
  if (!(target instanceof HTMLElement)) {
    return;
  }
  if (!isInputLike(target) && !target.closest(".memos-plus-modal, .memos-plus-view, .memos-plus-quick-input-view")) {
    return;
  }
  const inputLength = getInputContentLength(target);
  setMemosPlusDiagnosticState({
    inputFocused: event === "input:focus" && isInputLike(target),
    inputContentLength: inputLength
  });
  logMemosPlusDiagnostic(event, {
    target: describeElement(target),
    active: document.activeElement instanceof HTMLElement ? describeElement(document.activeElement) : ""
  });
}

function getInputContentLength(element: HTMLElement): number {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    return element.value.length;
  }
  if (element.isContentEditable) {
    return element.textContent?.length ?? 0;
  }
  return diagnosticState.inputContentLength;
}

function isInputLike(element: HTMLElement): boolean {
  const tagName = element.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select" || element.isContentEditable;
}

function getActivePage(app: App): string {
  const view = app.workspace.activeLeaf?.view;
  if (!view) {
    return "";
  }
  return view.getViewType?.() ?? view.getDisplayText?.() ?? "";
}

function describeElement(element: HTMLElement): string {
  const tagName = element.tagName.toLowerCase();
  const className = typeof element.className === "string" ? element.className.trim().split(/\s+/).slice(0, 4).join(".") : "";
  return className ? `${tagName}.${className}` : tagName;
}

function sanitizeRecord(detail: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(detail)) {
    sanitized[key] = sanitizeValue(value, 0);
  }
  return sanitized;
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (value === null || value === undefined || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value instanceof Error) {
    return summarizeError(value);
  }
  if (value instanceof HTMLElement) {
    return describeElement(value);
  }
  if (Array.isArray(value)) {
    return depth > 1 ? `[array:${value.length}]` : value.slice(0, 10).map((item) => sanitizeValue(item, depth + 1));
  }
  if (typeof value === "object") {
    if (depth > 1) {
      return "[object]";
    }
    const objectValue = value as Record<string, unknown>;
    const sanitized: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(objectValue).slice(0, 12)) {
      sanitized[key] = sanitizeValue(item, depth + 1);
    }
    return sanitized;
  }
  return String(value);
}

function summarizeError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  if (typeof error === "string") {
    return error;
  }
  return safeJson(error);
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
