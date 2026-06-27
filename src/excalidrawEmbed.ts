import { MarkdownView, Notice, Platform, type App, type EditorPosition, type TFile } from "obsidian";
import { formatExcalidrawMarkdownInsertion } from "./excalidrawLink";
import { resolveFileInsertCursor, type FileSendTarget } from "./fileSend";
import { selectProjectTarget, type ProjectDeliveryHost } from "./projectDelivery";
import { createDefaultProjectTemplate, type ManagedTemplate } from "./templateManager";

interface ExcalidrawPluginApi {
  settings?: {
    compatibilityMode?: boolean;
  };
  createDrawing: (filename: string, folder?: string | null) => Promise<TFile>;
  openDrawing: (file: TFile, openMode: "new-pane" | "new-tab" | "active-pane", active?: boolean, openState?: unknown, focus?: boolean) => unknown;
}

interface PluginRegistryApp {
  plugins?: {
    plugins?: Record<string, unknown>;
  };
}

export async function runExcalidrawCreateAfterTargetSelection(host: ProjectDeliveryHost): Promise<void> {
  const targetTemplate = createExcalidrawTargetTemplate(host.settings.projectTag, host.settings.projectFolderPath, host.settings.defaultProjectSection);
  const choice = await selectProjectTarget(host, "", "search", undefined, [targetTemplate], targetTemplate);
  if (!choice?.fileTarget) {
    return;
  }

  const hasPluginApi = Boolean(findExcalidrawPluginApi(host.app));
  if (!hasPluginApi) {
    new Notice("未找到 Excalidraw 创建接口，请先启用或更新 Excalidraw 插件");
    return;
  }

  const cursor = await prepareExcalidrawTargetCursor(host.app, choice.file, choice.fileTarget);
  if (cursor.fallbackToFileEnd) {
    new Notice("未找到选择的标题，已改为插入到文件末尾");
  }
  const positioned = await openMarkdownFileAtCursor(host.app, choice.file, cursor);
  if (!positioned) {
    new Notice("无法定位目标文件，已取消创建 Excalidraw");
    return;
  }

  host.settings.recentFileTargetPaths = [choice.file.path, ...host.settings.recentFileTargetPaths.filter((path) => path !== choice.file.path)].slice(0, 10);
  await host.persistSettings();
  const executed = await executeExcalidrawPluginApi(host.app, choice.file);
  if (!executed) {
    new Notice("无法创建 Excalidraw 链接，请确认 Excalidraw 插件已启用");
  }
}

async function prepareExcalidrawTargetCursor(app: App, file: TFile, target: FileSendTarget): Promise<EditorPosition & { fallbackToFileEnd: boolean }> {
  if (target.position === "new-heading") {
    const result = await ensureNewHeadingTarget(app, file, target);
    if (result) {
      return result;
    }
  }
  const source = await app.vault.read(file);
  return resolveFileInsertCursor(source, target);
}

async function ensureNewHeadingTarget(app: App, file: TFile, target: FileSendTarget): Promise<(EditorPosition & { fallbackToFileEnd: boolean }) | null> {
  const headingName = target.newHeadingName?.trim() || target.heading?.trim();
  if (!headingName) {
    return null;
  }
  let cursor: (EditorPosition & { fallbackToFileEnd: boolean }) | null = null;
  await app.vault.process(file, (source) => {
    const normalized = source.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n*$/, "");
    const lines = normalized ? normalized.split("\n") : [];
    const existingIndex = lines.findIndex((line) => markdownHeadingText(line) === headingName);
    if (existingIndex >= 0 && target.existingHeadingBehavior !== "create-duplicate") {
      cursor = resolveFileInsertCursor(source, { ...target, position: "heading-top", heading: headingName });
      return source;
    }

    const level = normalizeHeadingLevel(target.newHeadingLevel);
    const headingLine = `${"#".repeat(level)} ${headingName}`;
    const insertAt = target.newHeadingPosition === "file-start" ? safeFileStartInsertIndex(lines) : lines.length;
    const block = [headingLine, ""];
    const prefix = insertAt > 0 && lines[insertAt - 1]?.trim() !== "" ? [""] : [];
    const suffix = insertAt < lines.length && lines[insertAt]?.trim() !== "" ? [""] : [];
    lines.splice(insertAt, 0, ...prefix, ...block, ...suffix);
    const headingIndex = insertAt + prefix.length;
    cursor = { line: headingIndex + 1, ch: 0, fallbackToFileEnd: false };
    return `${lines.join("\n")}\n`;
  });
  return cursor;
}

async function openMarkdownFileAtCursor(app: App, file: TFile, cursor: EditorPosition): Promise<boolean> {
  const leaf = app.workspace.getLeaf(false);
  await leaf.openFile(file);
  await app.workspace.revealLeaf(leaf);
  app.workspace.setActiveLeaf(leaf, { focus: !Platform.isMobile });
  let view = leaf.view instanceof MarkdownView ? leaf.view : app.workspace.getActiveViewOfType(MarkdownView);
  if (!view || view.file?.path !== file.path) {
    return false;
  }
  view.editor.setCursor({ line: cursor.line, ch: cursor.ch });
  if (!Platform.isMobile) {
    view.editor.focus();
  }
  await waitForWorkspaceFrame(app);
  view = await waitForActiveMarkdownFile(app, file);
  if (!view) {
    return false;
  }
  view.editor.setCursor({ line: cursor.line, ch: cursor.ch });
  if (!Platform.isMobile) {
    view.editor.focus();
  }
  await waitForWorkspaceFrame(app);
  return true;
}

async function waitForActiveMarkdownFile(app: App, file: TFile): Promise<MarkdownView | null> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const view = app.workspace.getActiveViewOfType(MarkdownView);
    if (view?.file?.path === file.path) {
      return view;
    }
    await waitForWorkspaceFrame(app);
  }
  return null;
}

function waitForWorkspaceFrame(app: App): Promise<void> {
  const frameWindow = app.workspace.containerEl.ownerDocument.defaultView;
  if (!frameWindow) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    frameWindow.requestAnimationFrame(() => resolve());
  });
}

async function executeExcalidrawPluginApi(app: App, targetFile: TFile): Promise<boolean> {
  const api = findExcalidrawPluginApi(app);
  if (!api) {
    return false;
  }
  const activeView = app.workspace.getActiveViewOfType(MarkdownView);
  if (activeView?.file?.path !== targetFile.path) {
    return false;
  }
  try {
    const drawing = await api.createDrawing(buildExcalidrawDrawingFilename(targetFile, Boolean(api.settings?.compatibilityMode)));
    const view = await waitForActiveMarkdownFile(app, targetFile);
    if (!view) {
      return false;
    }
    if (!Platform.isMobile) {
      view.editor.focus();
    }
    const linkText = app.metadataCache.fileToLinktext(drawing, targetFile.path, false);
    const cursor = view.editor.getCursor();
    const currentLine = view.editor.getLine(cursor.line) ?? "";
    view.editor.replaceSelection(
      formatExcalidrawMarkdownInsertion(linkText, {
        before: currentLine.slice(0, cursor.ch),
        after: currentLine.slice(cursor.ch)
      })
    );
    api.openDrawing(drawing, "new-pane", true, undefined, true);
    return true;
  } catch (error) {
    console.warn("[Memos Plus] Failed to execute Excalidraw plugin API", error);
    return false;
  }
}

function findExcalidrawPluginApi(app: App): ExcalidrawPluginApi | null {
  const plugin = (app as unknown as PluginRegistryApp).plugins?.plugins?.["obsidian-excalidraw-plugin"];
  if (!isExcalidrawPluginApi(plugin)) {
    return null;
  }
  return plugin;
}

function isExcalidrawPluginApi(value: unknown): value is ExcalidrawPluginApi {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.createDrawing === "function" && typeof record.openDrawing === "function";
}

function createExcalidrawTargetTemplate(projectTag: string, projectFolderPath: string, defaultHeading: string): ManagedTemplate {
  return {
    ...createDefaultProjectTemplate(projectTag, projectFolderPath, defaultHeading),
    id: "excalidraw-target-selection",
    name: "新建 Excalidraw",
    insertFormat: "note",
    taskMode: "none"
  };
}

function buildExcalidrawDrawingFilename(targetFile: TFile, compatibilityMode: boolean, now = new Date()): string {
  const base = sanitizeExcalidrawFilenamePart(targetFile.basename);
  const stamp = [
    now.getFullYear(),
    padDatePart(now.getMonth() + 1),
    padDatePart(now.getDate()),
    padDatePart(now.getHours()),
    padDatePart(now.getMinutes()),
    padDatePart(now.getSeconds())
  ].join("-");
  return `${base} ${stamp}${compatibilityMode ? ".excalidraw" : ".excalidraw.md"}`;
}

function sanitizeExcalidrawFilenamePart(value: string): string {
  return value
    .replace(/[<>:"/\\|?*#^[\]\r\n]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "Drawing";
}

function padDatePart(value: number): string {
  return value.toString().padStart(2, "0");
}

function markdownHeadingText(line: string): string | null {
  const match = line.match(/^(\s{0,3}#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/);
  return match ? match[2].trim() : null;
}

function normalizeHeadingLevel(value: unknown): 1 | 2 | 3 | 4 | 5 | 6 {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN;
  return parsed >= 1 && parsed <= 6 ? (parsed as 1 | 2 | 3 | 4 | 5 | 6) : 2;
}

function safeFileStartInsertIndex(lines: string[]): number {
  if (lines[0]?.trim() !== "---") {
    return 0;
  }
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index]?.trim() === "---") {
      let insertAt = index + 1;
      while (insertAt < lines.length && lines[insertAt]?.trim() === "") {
        insertAt += 1;
      }
      return insertAt;
    }
  }
  return 0;
}
