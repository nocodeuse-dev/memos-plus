import type { Editor, TFile } from "obsidian";
import { parseTaskIndexItemsFromMarkdown, type TaskIndexItem } from "./taskIndex";

export function taskAtEditorCursor(editor: Editor, file: TFile | null): TaskIndexItem | null {
  if (!file) return null;
  const lineNumber = editor.getCursor().line;
  return taskAtMarkdownLine(editor.getLine(lineNumber) ?? "", lineNumber, file);
}

export function taskAtMarkdownLine(line: string, zeroBasedLineNumber: number, file: Pick<TFile, "path" | "basename" | "stat">): TaskIndexItem | null {
  const parsed = parseTaskIndexItemsFromMarkdown(line, {
    filePath: file.path,
    fileName: file.basename,
    mtime: file.stat.mtime
  })[0];
  return parsed ? { ...parsed, lineNumber: zeroBasedLineNumber + 1 } : null;
}
