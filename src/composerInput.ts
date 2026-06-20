import type { ComposerToolResult } from "./composerTools";

export type ComposerIndentDirection = "indent" | "outdent";

const INDENT = "  ";

export function handleComposerEnter(value: string, selectionStart: number, selectionEnd: number): ComposerToolResult | null {
  if (selectionStart !== selectionEnd) {
    return null;
  }
  const lineStart = findLineStart(value, selectionStart);
  const beforeCursor = value.slice(lineStart, selectionStart);
  const afterCursor = value.slice(selectionStart, findLineEnd(value, selectionStart));
  const continuation = getListContinuation(beforeCursor);
  if (!continuation) {
    return null;
  }
  if (continuation.isEmpty && afterCursor.trim() === "") {
    const nextValue = value.slice(0, lineStart) + value.slice(selectionStart);
    return {
      value: nextValue,
      selectionStart: lineStart,
      selectionEnd: lineStart
    };
  }
  return replaceSelection(value, selectionStart, selectionEnd, `\n${continuation.marker}`);
}

export function applyComposerIndent(value: string, selectionStart: number, selectionEnd: number, direction: ComposerIndentDirection): ComposerToolResult {
  const range = getSelectedLineRange(value, selectionStart, selectionEnd);
  const original = value.slice(range.start, range.end);
  const lines = original.split("\n");
  const lineStarts = getLineStarts(original, range.start);
  const changes: Array<{ lineStart: number; delta: number; removed: number }> = [];
  const nextLines = lines.map((line, index) => {
    if (direction === "indent") {
      changes.push({ lineStart: lineStarts[index], delta: INDENT.length, removed: 0 });
      return `${INDENT}${line}`;
    }
    const removed = line.startsWith(INDENT) ? INDENT.length : line.startsWith(" ") ? 1 : 0;
    changes.push({ lineStart: lineStarts[index], delta: -removed, removed });
    return line.slice(removed);
  });
  const replacement = nextLines.join("\n");
  return {
    value: value.slice(0, range.start) + replacement + value.slice(range.end),
    selectionStart: adjustOffset(selectionStart, changes, direction),
    selectionEnd: adjustOffset(selectionEnd, changes, direction)
  };
}

function getListContinuation(lineBeforeCursor: string): { marker: string; isEmpty: boolean } | null {
  const task = lineBeforeCursor.match(/^(\s*)[-*+]\s+\[[ xX]\]\s*(.*)$/);
  if (task) {
    return {
      marker: `${task[1]}- [ ] `,
      isEmpty: task[2].trim() === ""
    };
  }
  const unordered = lineBeforeCursor.match(/^(\s*)([-*+])\s+(.*)$/);
  if (unordered) {
    return {
      marker: `${unordered[1]}${unordered[2]} `,
      isEmpty: unordered[3].trim() === ""
    };
  }
  const ordered = lineBeforeCursor.match(/^(\s*)(\d+)([.)])\s+(.*)$/);
  if (ordered) {
    return {
      marker: `${ordered[1]}${Number.parseInt(ordered[2], 10) + 1}${ordered[3]} `,
      isEmpty: ordered[4].trim() === ""
    };
  }
  return null;
}

function getSelectedLineRange(value: string, selectionStart: number, selectionEnd: number): { start: number; end: number } {
  const effectiveEnd = selectionEnd > selectionStart && value[selectionEnd - 1] === "\n" ? selectionEnd - 1 : selectionEnd;
  return {
    start: findLineStart(value, selectionStart),
    end: findLineEnd(value, effectiveEnd)
  };
}

function getLineStarts(block: string, baseOffset: number): number[] {
  const starts = [baseOffset];
  for (let index = 0; index < block.length; index++) {
    if (block[index] === "\n") {
      starts.push(baseOffset + index + 1);
    }
  }
  return starts;
}

function adjustOffset(offset: number, changes: Array<{ lineStart: number; delta: number; removed: number }>, direction: ComposerIndentDirection): number {
  let nextOffset = offset;
  for (const change of changes) {
    if (offset <= change.lineStart) {
      continue;
    }
    if (direction === "indent") {
      nextOffset += change.delta;
    } else {
      nextOffset -= Math.min(change.removed, offset - change.lineStart);
    }
  }
  return nextOffset;
}

function findLineStart(value: string, offset: number): number {
  return value.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
}

function findLineEnd(value: string, offset: number): number {
  const nextBreak = value.indexOf("\n", offset);
  return nextBreak < 0 ? value.length : nextBreak;
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
