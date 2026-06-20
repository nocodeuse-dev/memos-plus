import { App, Editor, EditorPosition, EditorSuggest, EditorSuggestContext, EditorSuggestTriggerInfo } from "obsidian";

interface TagItem {
  tag: string;
  count: number;
}

interface LinkItem {
  label: string;
  path: string;
}

export class MemosPlusTagSuggest extends EditorSuggest<TagItem> {
  constructor(app: App) {
    super(app);
  }

  onTrigger(cursor: EditorPosition, editor: Editor): EditorSuggestTriggerInfo | null {
    if (!isMemosPlusComposerEditor(editor)) {
      return null;
    }
    const beforeCursor = editor.getLine(cursor.line).slice(0, cursor.ch);
    const match = beforeCursor.match(/(^|\s)#([^\s#\]]*)$/);
    if (!match) {
      return null;
    }
    const query = match[2] ?? "";
    return {
      start: { line: cursor.line, ch: cursor.ch - query.length - 1 },
      end: cursor,
      query
    };
  }

  getSuggestions(context: EditorSuggestContext): TagItem[] {
    const query = context.query.toLowerCase();
    return collectVaultTags(this.app)
      .filter((item) => !query || item.tag.toLowerCase().includes(query))
      .slice(0, 20);
  }

  renderSuggestion(value: TagItem, el: HTMLElement): void {
    el.createDiv({ text: `#${value.tag}` });
    el.createEl("small", { text: String(value.count) });
  }

  selectSuggestion(value: TagItem): void {
    const context = this.context;
    if (!context) {
      return;
    }
    context.editor.replaceRange(`#${value.tag}`, context.start, context.end);
  }
}

export class MemosPlusLinkSuggest extends EditorSuggest<LinkItem> {
  constructor(app: App) {
    super(app);
  }

  onTrigger(cursor: EditorPosition, editor: Editor): EditorSuggestTriggerInfo | null {
    if (!isMemosPlusComposerEditor(editor)) {
      return null;
    }
    const beforeCursor = editor.getLine(cursor.line).slice(0, cursor.ch);
    const start = beforeCursor.lastIndexOf("[[");
    if (start < 0 || beforeCursor.slice(start).includes("]]")) {
      return null;
    }
    return {
      start: { line: cursor.line, ch: start },
      end: cursor,
      query: beforeCursor.slice(start + 2)
    };
  }

  getSuggestions(context: EditorSuggestContext): LinkItem[] {
    const query = context.query.toLowerCase();
    return this.app.vault
      .getMarkdownFiles()
      .map((file) => ({ label: file.basename, path: file.path }))
      .filter((item) => !query || item.label.toLowerCase().includes(query) || item.path.toLowerCase().includes(query))
      .slice(0, 20);
  }

  renderSuggestion(value: LinkItem, el: HTMLElement): void {
    el.createDiv({ text: value.label });
    el.createEl("small", { text: value.path });
  }

  selectSuggestion(value: LinkItem): void {
    const context = this.context;
    if (!context) {
      return;
    }
    context.editor.replaceRange(`[[${value.label}]]`, context.start, context.end);
  }
}

function isMemosPlusComposerEditor(editor: Editor): boolean {
  const maybeEditor = editor as Editor & { containerEl?: HTMLElement };
  return Boolean(maybeEditor.containerEl?.closest(".memos-plus-composer"));
}

function collectVaultTags(app: App): TagItem[] {
  const metadataCache = app.metadataCache as unknown as { getTags?: () => Record<string, number> };
  const tags = typeof metadataCache.getTags === "function" ? metadataCache.getTags() : {};
  return Object.entries(tags)
    .map(([tag, count]) => ({ tag: tag.replace(/^#/, ""), count }))
    .sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag));
}
