import { MarkdownView, Notice, Platform, type App, type EditorPosition, type TFile } from "obsidian";
import { findExcalidrawEmbedCommand, type ObsidianCommandInfo } from "./excalidrawCommand";
import { resolveFileInsertCursor, type FileSendTarget } from "./fileSend";
import { selectProjectTarget, type ProjectDeliveryHost } from "./projectDelivery";
import { createDefaultProjectTemplate, type ManagedTemplate } from "./templateManager";

interface CommandRegistryApp {
  commands?: {
    listCommands?: () => ObsidianCommandInfo[];
    executeCommandById?: (id: string) => unknown;
  };
}

export async function runExcalidrawCreateAfterTargetSelection(host: ProjectDeliveryHost): Promise<void> {
  const command = findRegisteredExcalidrawEmbedCommand(host.app);
  if (!command) {
    new Notice("未找到 Excalidraw 嵌入命令，请先启用 Excalidraw 插件");
    return;
  }

  const targetTemplate = createExcalidrawTargetTemplate(host.settings.projectTag, host.settings.projectFolderPath, host.settings.defaultProjectSection);
  const choice = await selectProjectTarget(host, "", "search", undefined, [targetTemplate], targetTemplate);
  if (!choice?.fileTarget) {
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
  const executed = executeRegisteredCommand(host.app, command.id);
  if (!executed) {
    new Notice("无法执行 Excalidraw 嵌入命令，请确认 Excalidraw 插件已启用");
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
  const view = app.workspace.getActiveViewOfType(MarkdownView);
  if (!view || view.file?.path !== file.path) {
    return false;
  }
  view.editor.setCursor({ line: cursor.line, ch: cursor.ch });
  if (!Platform.isMobile) {
    view.editor.focus();
  }
  return true;
}

function findRegisteredExcalidrawEmbedCommand(app: App): ObsidianCommandInfo | null {
  const registry = (app as unknown as CommandRegistryApp).commands;
  const commands = registry?.listCommands?.() ?? [];
  return findExcalidrawEmbedCommand(commands);
}

function executeRegisteredCommand(app: App, id: string): boolean {
  const registry = (app as unknown as CommandRegistryApp).commands;
  try {
    return registry?.executeCommandById?.(id) !== false;
  } catch (error) {
    console.warn("[Memos Plus] Failed to execute Excalidraw command", error);
    return false;
  }
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
