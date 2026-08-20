import { RangeSetBuilder, type Extension } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { editorInfoField, type TFile } from "obsidian";
import { t, type Language } from "./i18n";
import { taskAtMarkdownLine } from "./currentTaskEditor";
import type { TaskIndexItem } from "./taskIndex";
import { taskMetadataRangesForLine } from "./taskMetadataRanges";
import {
  normalizeTaskCheckboxCompletion,
  taskCheckboxCompletionTransition
} from "./taskCheckboxCompletion";

export interface TaskMetadataEditorHost {
  settings: { language: Language };
  openTaskCalendarTaskEditor(task: TaskIndexItem): Promise<void>;
}


export function createTaskMetadataEditorExtension(host: TaskMetadataEditorHost): Extension {
  return TaskMetadataEditorPlugin.of(host);
}

class TaskMetadataEditHint extends WidgetType {
  constructor(private readonly label: string) {
    super();
  }

  eq(other: TaskMetadataEditHint): boolean {
    return other.label === this.label;
  }

  toDOM(): HTMLElement {
    const element = document.createElement("span");
    element.className = "memos-plus-task-editor-inline-hint";
    element.dataset.memosPlusTaskEdit = "hint";
    element.setAttribute("role", "button");
    element.setAttribute("aria-label", this.label);
    element.setAttribute("title", this.label);
    element.textContent = "⚙";
    return element;
  }
}

class TaskMetadataEditorValue {
  decorations: DecorationSet;
  private mouseDown: { target: HTMLElement; x: number; y: number; hadSelection: boolean } | null = null;
  private readonly pendingCheckboxTransitions = new Map<number, PendingCheckboxTransition>();
  private completionNormalizationTimer: number | null = null;

  constructor(private readonly view: EditorView, private readonly host: TaskMetadataEditorHost) {
    this.decorations = buildTaskMetadataDecorations(view, host.settings.language);
  }

  update(update: ViewUpdate): void {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = buildTaskMetadataDecorations(update.view, this.host.settings.language);
    }
    if (update.docChanged) this.captureCheckboxTransitions(update);
  }

  destroy(): void {
    if (this.completionNormalizationTimer !== null) window.clearTimeout(this.completionNormalizationTimer);
    this.completionNormalizationTimer = null;
    this.pendingCheckboxTransitions.clear();
  }

  onMouseDown(event: MouseEvent): boolean {
    const target = taskEditTarget(event.target);
    if (!target) return false;
    this.mouseDown = {
      target,
      x: event.clientX,
      y: event.clientY,
      hadSelection: this.view.state.selection.ranges.some((range) => !range.empty)
    };
    return false;
  }

  onClick(event: MouseEvent): boolean {
    const target = taskEditTarget(event.target);
    const down = this.mouseDown;
    this.mouseDown = null;
    if (!target || !down || event.defaultPrevented || event.button !== 0) return false;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
    if (down.hadSelection || Math.abs(event.clientX - down.x) > 4 || Math.abs(event.clientY - down.y) > 4) return false;
    // Let native links and tags retain their usual Obsidian actions. The
    // surrounding date/time/priority tokens remain the task-editor hot zone.
    if (target.dataset.memosPlusTaskEdit === "metadata" && nativeLinkOrTagTarget(event.target)) return false;

    let position: number;
    try {
      position = this.view.posAtDOM(target, 0);
    } catch {
      return false;
    }
    const line = this.view.state.doc.lineAt(position);
    const file = this.file();
    const task = file ? taskAtMarkdownLine(line.text, line.number - 1, file) : null;
    if (!task) return false;
    event.preventDefault();
    event.stopPropagation();
    void this.host.openTaskCalendarTaskEditor(task).catch((error) => {
      console.error("[Memos Plus] Failed to open task editor from task metadata", error);
    });
    return true;
  }

  private file(): TFile | null {
    try {
      return this.view.state.field(editorInfoField).file;
    } catch {
      return null;
    }
  }

  private captureCheckboxTransitions(update: ViewUpdate): void {
    update.changes.iterChangedRanges((fromA, _toA, fromB) => {
      const before = update.startState.doc.lineAt(fromA);
      const after = update.state.doc.lineAt(fromB);
      const transition = taskCheckboxCompletionTransition(before.text, after.text);
      if (!transition) return;
      this.pendingCheckboxTransitions.set(after.number, { beforeLine: before.text, expectedLine: after.text });
    });
    if (this.pendingCheckboxTransitions.size === 0 || this.completionNormalizationTimer !== null) return;
    // Native checkbox handling owns the initial editor transaction. Scheduling
    // the metadata follow-up avoids dispatching from a ViewPlugin update while
    // still making the date/time visible on the next frame.
    this.completionNormalizationTimer = window.setTimeout(() => {
      this.completionNormalizationTimer = null;
      this.normalizeCheckboxCompletions();
    }, 0);
  }

  private normalizeCheckboxCompletions(): void {
    const pending = [...this.pendingCheckboxTransitions.entries()];
    this.pendingCheckboxTransitions.clear();
    const changes: Array<{ from: number; to: number; insert: string }> = [];
    for (const [lineNumber, entry] of pending) {
      if (lineNumber < 1 || lineNumber > this.view.state.doc.lines) continue;
      const line = this.view.state.doc.line(lineNumber);
      if (line.text !== entry.expectedLine) continue;
      const replacement = normalizeTaskCheckboxCompletion(entry.beforeLine, line.text);
      if (replacement !== line.text) changes.push({ from: line.from, to: line.to, insert: replacement });
    }
    if (changes.length > 0) this.view.dispatch({ changes });
  }
}

interface PendingCheckboxTransition {
  beforeLine: string;
  expectedLine: string;
}

const TaskMetadataEditorPlugin = ViewPlugin.fromClass(TaskMetadataEditorValue, {
  decorations: (value) => value.decorations,
  eventHandlers: {
    mousedown(event) {
      return this.onMouseDown(event);
    },
    click(event) {
      return this.onClick(event);
    }
  }
});

function buildTaskMetadataDecorations(view: EditorView, language: Language): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const seenLines = new Set<number>();
  const label = t(language, "taskCalendar.editTask");
  const marker = Decoration.mark({
    class: "memos-plus-task-editor-metadata",
    attributes: { "data-memos-plus-task-edit": "metadata", title: label, "aria-label": label }
  });
  for (const range of view.visibleRanges) {
    const first = view.state.doc.lineAt(range.from).number;
    const last = view.state.doc.lineAt(Math.max(range.from, range.to - 1)).number;
    for (let lineNumber = first; lineNumber <= last; lineNumber += 1) {
      if (seenLines.has(lineNumber)) continue;
      seenLines.add(lineNumber);
      const line = view.state.doc.line(lineNumber);
      const ranges = taskMetadataRangesForLine(line.text);
      if (ranges.length === 0) {
        if (isTaskLine(line.text)) builder.add(line.to, line.to, Decoration.widget({ widget: new TaskMetadataEditHint(label), side: 1 }));
        continue;
      }
      for (const metadata of ranges) builder.add(line.from + metadata.from, line.from + metadata.to, marker);
    }
  }
  return builder.finish();
}

function isTaskLine(line: string): boolean {
  return /^\s*(?:[-*+]|\d+[.)])\s+\[[^\]]\]/u.test(line);
}

function taskEditTarget(target: EventTarget | null): HTMLElement | null {
  return target instanceof HTMLElement ? target.closest<HTMLElement>("[data-memos-plus-task-edit]") : null;
}

function nativeLinkOrTagTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("a, .cm-link, .cm-url, .cm-hashtag, .cm-hmd-internal-link"));
}
