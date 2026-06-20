export type ComposerTextTool = "tag" | "ul" | "ol" | "task";
export type ComposerTool = ComposerTextTool;
export type ComposerToolbarToolId =
  | "tag"
  | "image"
  | "unorderedList"
  | "orderedList"
  | "task"
  | "table"
  | "callout"
  | "codeBlock"
  | "excalidraw";
export type ComposerToolbarSettings = Record<ComposerToolbarToolId, boolean>;

export const COMPOSER_TOOLBAR_TOOL_IDS: ComposerToolbarToolId[] = [
  "tag",
  "image",
  "unorderedList",
  "orderedList",
  "task",
  "table",
  "callout",
  "codeBlock",
  "excalidraw"
];

export const DEFAULT_COMPOSER_TOOLBAR_SETTINGS: ComposerToolbarSettings = {
  tag: true,
  image: true,
  unorderedList: true,
  orderedList: true,
  task: true,
  table: true,
  callout: true,
  codeBlock: false,
  excalidraw: false
};

export interface ComposerToolResult {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

export function applyComposerTool(value: string, selectionStart: number, selectionEnd: number, tool: ComposerTextTool): ComposerToolResult {
  if (tool === "tag") {
    return insertAtCursor(value, selectionStart, selectionEnd, "#");
  }
  if (tool === "ul") {
    return insertListAtCursor(value, selectionStart, selectionEnd, "- ");
  }
  if (tool === "ol") {
    return insertOrderedListAtCursor(value, selectionStart, selectionEnd);
  }
  return insertListAtCursor(value, selectionStart, selectionEnd, "- [ ] ");
}

export function insertTableAtCursor(value: string, selectionStart: number, selectionEnd: number, rows: number, columns: number): ComposerToolResult {
  const rowCount = Math.max(1, Math.floor(rows));
  const columnCount = Math.max(1, Math.floor(columns));
  const blankRow = `| ${Array(columnCount).fill("  ").join(" | ")} |`;
  const separator = `| ${Array(columnCount).fill("--").join(" | ")} |`;
  const bodyRows = Array(Math.max(0, rowCount - 1)).fill(blankRow);
  const table = [blankRow, separator, ...bodyRows].join("\n");
  const before = value.slice(0, selectionStart);
  const after = value.slice(selectionEnd);
  let prefix = "";
  let suffix = "\n";

  if (before && !before.endsWith("\n\n")) {
    prefix = before.endsWith("\n") ? "\n" : "\n\n";
  }
  if (after && !after.startsWith("\n")) {
    suffix = "\n\n";
  }

  return insertAtCursor(value, selectionStart, selectionEnd, `${prefix}${table}${suffix}`);
}

export function formatImageEmbedInsertion(value: string, selectionStart: number, selectionEnd: number, fileName: string): ComposerToolResult {
  const embed = `![[${fileName}]]`;
  const insertion = value && !/\n$/.test(value) ? `\n${embed}\n` : `${embed}\n`;
  return insertAtCursor(value, selectionStart, selectionEnd, insertion);
}

export function wrapCodeBlockAtCursor(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  language = "text"
): ComposerToolResult {
  const hasSelection = selectionStart !== selectionEnd;
  const start = hasSelection ? selectionStart : 0;
  const end = hasSelection ? selectionEnd : value.length;
  const selected = value.slice(start, end);
  const before = value.slice(0, start);
  const after = value.slice(end);
  const prefix = before && !before.endsWith("\n") ? "\n\n" : "";
  const suffix = after && !after.startsWith("\n") ? "\n\n" : "";
  const fenced = `\`\`\`${language}\n${selected}\n\`\`\``;
  const replacement = `${prefix}${fenced}${suffix}`;
  const nextValue = before + replacement + after;
  const cursor = selected
    ? start + replacement.length - suffix.length
    : start + prefix.length + `\`\`\`${language}\n`.length;
  return {
    value: nextValue,
    selectionStart: cursor,
    selectionEnd: cursor
  };
}

export function normalizeComposerToolbarSettings(value: unknown): ComposerToolbarSettings {
  const raw = isRecord(value) ? value : {};
  return Object.fromEntries(
    COMPOSER_TOOLBAR_TOOL_IDS.map((id) => [id, typeof raw[id] === "boolean" ? raw[id] : DEFAULT_COMPOSER_TOOLBAR_SETTINGS[id]])
  ) as ComposerToolbarSettings;
}

function insertAtCursor(value: string, selectionStart: number, selectionEnd: number, insertion: string): ComposerToolResult {
  const selected = value.slice(selectionStart, selectionEnd);
  return replaceSelection(value, selectionStart, selectionEnd, selectionStart !== selectionEnd ? `${insertion}${selected}` : insertion);
}

function insertListAtCursor(value: string, selectionStart: number, selectionEnd: number, prefix: string): ComposerToolResult {
  const isLineStart = selectionStart === 0 || value[selectionStart - 1] === "\n";
  if (selectionStart !== selectionEnd) {
    const selected = value.slice(selectionStart, selectionEnd);
    const replacement = selected.split("\n").map((line) => `${prefix}${line}`).join("\n");
    return replaceSelection(value, selectionStart, selectionEnd, isLineStart ? replacement : `\n${replacement}`);
  }
  return replaceSelection(value, selectionStart, selectionEnd, isLineStart ? prefix : `\n${prefix}`);
}

function insertOrderedListAtCursor(value: string, selectionStart: number, selectionEnd: number): ComposerToolResult {
  const isLineStart = selectionStart === 0 || value[selectionStart - 1] === "\n";
  if (selectionStart !== selectionEnd) {
    const selected = value.slice(selectionStart, selectionEnd);
    const replacement = selected.split("\n").map((line, index) => `${index + 1}. ${line}`).join("\n");
    return replaceSelection(value, selectionStart, selectionEnd, isLineStart ? replacement : `\n${replacement}`);
  }
  const nextNumber = getNextOrderedListNumber(value.slice(0, selectionStart));
  const marker = `${nextNumber}. `;
  return replaceSelection(value, selectionStart, selectionEnd, isLineStart ? marker : `\n${marker}`);
}

function getNextOrderedListNumber(beforeCursor: string): number {
  const lines = beforeCursor.split("\n");
  for (let index = lines.length - 1; index >= 0; index--) {
    const line = lines[index];
    if (line.trim() === "") {
      continue;
    }
    const match = line.match(/^\s*(\d+)\.\s/);
    return match ? Number.parseInt(match[1], 10) + 1 : 1;
  }
  return 1;
}

function replaceSelection(value: string, selectionStart: number, selectionEnd: number, replacement: string): ComposerToolResult {
  const nextValue = value.slice(0, selectionStart) + replacement + value.slice(selectionEnd);
  const cursor = selectionStart + replacement.length;
  return {
    value: nextValue,
    selectionStart: cursor,
    selectionEnd: cursor
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
