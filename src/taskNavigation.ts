import { App, MarkdownView, Platform, TFile, type WorkspaceLeaf } from "obsidian";
import type { TaskIndexItem } from "./taskIndex";

export async function openIndexedTask(app: App, item: TaskIndexItem): Promise<void> {
  const file = app.vault.getAbstractFileByPath(item.filePath);
  if (!(file instanceof TFile)) {
    return;
  }
  const leaf = app.workspace.getLeaf(false);
  await leaf.openFile(file, { state: { line: item.lineNumber - 1 } });
  await highlightIndexedTaskLine(app, leaf, file, item);
}

async function highlightIndexedTaskLine(app: App, leaf: WorkspaceLeaf, file: TFile, item: TaskIndexItem): Promise<void> {
  const line = Math.max(0, item.lineNumber - 1);
  await waitForWorkspaceFrame(app);
  let view = leaf.view instanceof MarkdownView ? leaf.view : app.workspace.getActiveViewOfType(MarkdownView);
  if (!view || view.file?.path !== file.path) {
    await waitForWorkspaceFrame(app);
    view = leaf.view instanceof MarkdownView ? leaf.view : app.workspace.getActiveViewOfType(MarkdownView);
  }
  if (!view || view.file?.path !== file.path) {
    return;
  }
  view.editor.setSelection({ line, ch: 0 }, { line, ch: item.line.length });
  view.editor.scrollIntoView({ from: { line, ch: 0 }, to: { line, ch: item.line.length } }, true);
  if (!Platform.isMobile) {
    view.editor.focus();
  }
}

function waitForWorkspaceFrame(app: App): Promise<void> {
  const frameWindow = app.workspace.containerEl.ownerDocument.defaultView;
  if (!frameWindow) {
    return Promise.resolve();
  }
  return new Promise((resolve) => frameWindow.requestAnimationFrame(() => resolve()));
}
