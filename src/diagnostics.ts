import { Platform, type App, type Plugin } from "obsidian";

interface DiagnosticsConfig {
  enabled: boolean;
  sessionId: string;
  version?: string;
}

let diagnosticsEnabled = false;
let diagnosticsSessionId = "";
let diagnosticsVersion = "";
let diagnosticsSeq = 0;
let viewportLogTimer: number | null = null;

export const DIAGNOSTIC_EVENT_NAMES = [
  "memos-plus:onload",
  "memos-plus:onunload",
  "view:constructor",
  "view:onOpen",
  "view:onClose",
  "modal:onOpen",
  "modal:onClose",
  "settings:save",
  "settings:persist",
  "view:render",
  "view:refresh",
  "workspace:layout-change",
  "visualViewport:resize",
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
  diagnosticsEnabled = config.enabled;
  diagnosticsSessionId = config.sessionId;
  diagnosticsVersion = config.version ?? diagnosticsVersion;
}

export function logMemosPlusDiagnostic(event: MemosPlusDiagnosticEvent, detail: Record<string, unknown> = {}): void {
  if (!diagnosticsEnabled) {
    return;
  }
  diagnosticsSeq += 1;
  console.warn("[Memos Plus diag]", {
    sessionId: diagnosticsSessionId,
    seq: diagnosticsSeq,
    version: diagnosticsVersion,
    mobile: Platform.isMobile,
    event,
    ...detail
  });
}

export function registerMemosPlusDiagnostics(plugin: Plugin, app: App): void {
  plugin.registerEvent(
    app.workspace.on("layout-change", () => {
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

  window.addEventListener("error", handleWindowError);
  window.addEventListener("unhandledrejection", handleUnhandledRejection);
  document.addEventListener("focusin", handleFocus, true);
  document.addEventListener("focusout", handleBlur, true);
  plugin.register(() => {
    window.removeEventListener("error", handleWindowError);
    window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    document.removeEventListener("focusin", handleFocus, true);
    document.removeEventListener("focusout", handleBlur, true);
    clearViewportLogTimer();
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

function clearViewportLogTimer(): void {
  if (viewportLogTimer === null) {
    return;
  }
  window.clearTimeout(viewportLogTimer);
  viewportLogTimer = null;
}

function logInputFocusEvent(event: "input:focus" | "input:blur", target: EventTarget | null): void {
  if (!(target instanceof HTMLElement)) {
    return;
  }
  if (!isInputLike(target) && !target.closest(".memos-plus-modal, .memos-plus-view, .memos-plus-quick-input-view")) {
    return;
  }
  logMemosPlusDiagnostic(event, {
    target: describeElement(target),
    active: document.activeElement instanceof HTMLElement ? describeElement(document.activeElement) : ""
  });
}

function isInputLike(element: HTMLElement): boolean {
  const tagName = element.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select" || element.isContentEditable;
}

function describeElement(element: HTMLElement): string {
  const tagName = element.tagName.toLowerCase();
  const className = typeof element.className === "string" ? element.className.trim().split(/\s+/).slice(0, 4).join(".") : "";
  return className ? `${tagName}.${className}` : tagName;
}

function summarizeError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
