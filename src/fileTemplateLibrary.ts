import { App, TFile, TFolder, normalizePath } from "obsidian";
import { normalizeFileTag } from "./fileSend";
import { renderTemplateVariables, type TemplateVariableContext } from "./templateManager";

export const DEFAULT_FILE_TEMPLATE_LIBRARY_FOLDER = "我的资源/模板";
export const DEFAULT_FILE_TEMPLATE_LIBRARY_TARGET_FOLDER = "我的资源/Memos";
export const FILE_TEMPLATE_LIBRARY_RECENT_LIMIT = 20;
export const FILE_TEMPLATE_LIBRARY_TAB_ALL = "all";
export const FILE_TEMPLATE_LIBRARY_TAB_RECENT = "recent";
export const FILE_TEMPLATE_LIBRARY_BUILT_IN_TAB_IDS = [
  FILE_TEMPLATE_LIBRARY_TAB_ALL,
  FILE_TEMPLATE_LIBRARY_TAB_RECENT
] as const;

export interface FileTemplateLibraryItem {
  path: string;
  name: string;
  category: string;
  tags: string[];
  updatedAt: number;
  isRecent: boolean;
  file?: TFile;
}

export type FileTemplateTabType = "tag-filter" | "template-group";

export interface FileTemplateTab {
  id: string;
  name: string;
  type: FileTemplateTabType;
  tags: string[];
  templatePaths: string[];
}

export interface FileTemplateTabInteractionSettings {
  enableDesktopDrag: boolean;
  enableMobileDrag: boolean;
  enableMobileReorder: boolean;
  mobileReadOnly: boolean;
}

export interface FileTemplateLibraryInteractionSettings {
  enableDesktopTabDrag: boolean;
  enableMobileTabDrag: boolean;
}

export const DEFAULT_FILE_TEMPLATE_TAB_INTERACTION: FileTemplateTabInteractionSettings = {
  enableDesktopDrag: true,
  enableMobileDrag: false,
  enableMobileReorder: false,
  mobileReadOnly: true
};

export const DEFAULT_FILE_TEMPLATE_LIBRARY_INTERACTION: FileTemplateLibraryInteractionSettings = {
  enableDesktopTabDrag: true,
  enableMobileTabDrag: false
};

export interface FileTemplateLibraryFilter {
  query?: string;
  category?: string;
}

export interface FileTemplateLibrarySettings {
  fileTemplateLibraryFolder: string;
  fileTemplateLibraryDefaultFolder: string;
  fileTemplateLibraryRecent: string[];
  fileTemplateLibraryDefaults: Record<string, string>;
  fileTemplateLibraryDefaultTabId?: string;
  fileTemplateLibraryTabOrder?: string[];
  fileTemplateLibraryInteraction?: FileTemplateLibraryInteractionSettings;
  fileTemplateTabs?: FileTemplateTab[];
  fileTemplateTabInteraction?: FileTemplateTabInteractionSettings;
}

export function normalizeFileTemplateTabs(value: unknown): FileTemplateTab[] {
  const source = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  return source.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }
    const type: FileTemplateTabType = item.type === "template-group" ? "template-group" : "tag-filter";
    const tags = type === "tag-filter" ? normalizeFileTemplateTabTags(item.tags) : [];
    const templatePaths = type === "template-group" ? normalizeFileTemplateLibraryPaths(item.templatePaths) : [];
    const name = normalizeFileTemplateTabName(item.name, type, tags);
    if ((type === "tag-filter" && tags.length === 0) || !name) {
      return [];
    }
    const id = normalizeFileTemplateTabId(item.id, type, name, tags, seen);
    if (!id || seen.has(id)) {
      return [];
    }
    seen.add(id);
    return [{ id, name, type, tags, templatePaths }];
  });
}

export function normalizeFileTemplateTabInteraction(value: unknown, legacyEnableTemplateTabDrag?: unknown): FileTemplateTabInteractionSettings {
  const raw = isRecord(value) ? value : {};
  const mobileReadOnly = typeof raw.mobileReadOnly === "boolean" ? raw.mobileReadOnly : DEFAULT_FILE_TEMPLATE_TAB_INTERACTION.mobileReadOnly;
  return {
    enableDesktopDrag:
      typeof raw.enableDesktopDrag === "boolean"
        ? raw.enableDesktopDrag
        : typeof legacyEnableTemplateTabDrag === "boolean"
          ? legacyEnableTemplateTabDrag
          : DEFAULT_FILE_TEMPLATE_TAB_INTERACTION.enableDesktopDrag,
    enableMobileDrag: mobileReadOnly
      ? false
      : typeof raw.enableMobileDrag === "boolean"
        ? raw.enableMobileDrag
        : DEFAULT_FILE_TEMPLATE_TAB_INTERACTION.enableMobileDrag,
    enableMobileReorder: mobileReadOnly
      ? false
      : typeof raw.enableMobileReorder === "boolean"
        ? raw.enableMobileReorder
        : DEFAULT_FILE_TEMPLATE_TAB_INTERACTION.enableMobileReorder,
    mobileReadOnly
  };
}

export function normalizeFileTemplateLibraryInteraction(value: unknown): FileTemplateLibraryInteractionSettings {
  const raw = isRecord(value) ? value : {};
  return {
    enableDesktopTabDrag:
      typeof raw.enableDesktopTabDrag === "boolean"
        ? raw.enableDesktopTabDrag
        : DEFAULT_FILE_TEMPLATE_LIBRARY_INTERACTION.enableDesktopTabDrag,
    enableMobileTabDrag:
      typeof raw.enableMobileTabDrag === "boolean"
        ? raw.enableMobileTabDrag
        : DEFAULT_FILE_TEMPLATE_LIBRARY_INTERACTION.enableMobileTabDrag
  };
}

export function getFileTemplateLibraryCategoryTabId(category: unknown): string {
  const normalized = normalizeText(category);
  return normalized ? `category:${normalized}` : "";
}

export function normalizeFileTemplateLibraryTabId(value: unknown): string {
  const id = normalizeText(value);
  if ((FILE_TEMPLATE_LIBRARY_BUILT_IN_TAB_IDS as readonly string[]).includes(id)) {
    return id;
  }
  if (id.startsWith("category:")) {
    return getFileTemplateLibraryCategoryTabId(id.slice("category:".length));
  }
  if (id.startsWith("custom:")) {
    const customId = normalizeText(id.slice("custom:".length));
    return customId ? `custom:${customId}` : "";
  }
  return "";
}

export function normalizeFileTemplateLibraryTabOrder(value: unknown, availableIds?: string[]): string[] {
  const available = availableIds ? new Set(availableIds.map((id) => normalizeFileTemplateLibraryTabId(id)).filter(Boolean)) : null;
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\n,，]+/) : [];
  const seen = new Set<string>();
  const ordered = source.flatMap((item) => {
    const id = normalizeFileTemplateLibraryTabId(item);
    if (!id || seen.has(id) || (available && !available.has(id))) {
      return [];
    }
    seen.add(id);
    return [id];
  });
  if (availableIds) {
    for (const rawId of availableIds) {
      const id = normalizeFileTemplateLibraryTabId(rawId);
      if (id && available?.has(id) && !seen.has(id)) {
        ordered.push(id);
        seen.add(id);
      }
    }
  }
  return ordered;
}

export function normalizeFileTemplateLibraryDefaultTabId(value: unknown, availableIds?: string[]): string {
  const id = normalizeFileTemplateLibraryTabId(value) || FILE_TEMPLATE_LIBRARY_TAB_ALL;
  if (!availableIds) {
    return id;
  }
  const available = new Set(availableIds.map((item) => normalizeFileTemplateLibraryTabId(item)).filter(Boolean));
  return available.has(id) ? id : FILE_TEMPLATE_LIBRARY_TAB_ALL;
}

export function getFileTemplateLibraryTemplateGroupTabId(tabId: unknown): string {
  const id = normalizeText(tabId);
  return id ? `custom:${id}` : "";
}

export function getFileTemplateLibraryTemplateGroupTab(tabId: unknown, tabs: FileTemplateTab[]): FileTemplateTab | null {
  const id = normalizeFileTemplateLibraryTabId(tabId);
  if (!id.startsWith("custom:")) {
    return null;
  }
  const customId = id.slice("custom:".length);
  return normalizeFileTemplateTabs(tabs).find((tab) => tab.id === customId && tab.type === "template-group") ?? null;
}

export function getVisibleFileTemplateLibraryTabIds(tabs: FileTemplateTab[], tabOrder?: unknown): string[] {
  const groupIds = normalizeFileTemplateTabs(tabs)
    .filter((tab) => tab.type === "template-group")
    .map((tab) => getFileTemplateLibraryTemplateGroupTabId(tab.id))
    .filter(Boolean);
  const orderedGroups = normalizeFileTemplateLibraryTabOrder(tabOrder, groupIds);
  return [FILE_TEMPLATE_LIBRARY_TAB_ALL, ...orderedGroups.filter((id) => id !== FILE_TEMPLATE_LIBRARY_TAB_ALL)];
}

export function normalizeVisibleFileTemplateLibraryDefaultTabId(value: unknown, tabs: FileTemplateTab[]): string {
  const ids = new Set(getVisibleFileTemplateLibraryTabIds(tabs));
  const id = normalizeFileTemplateLibraryTabId(value);
  return id && ids.has(id) ? id : FILE_TEMPLATE_LIBRARY_TAB_ALL;
}

export function createTagFilterFileTemplateTab(tagValue: string): FileTemplateTab | null {
  const tag = normalizeFileTag(tagValue);
  if (!tag) {
    return null;
  }
  return { id: tag, name: tag, type: "tag-filter", tags: [tag], templatePaths: [] };
}

export function createTemplateGroupFileTemplateTab(nameValue: string): FileTemplateTab | null {
  const name = normalizeText(nameValue);
  if (!name) {
    return null;
  }
  return { id: uniqueTabSeed("group", name), name, type: "template-group", tags: [], templatePaths: [] };
}

export function legacyProjectSendTagsToFileTemplateTabs(tags: unknown): FileTemplateTab[] {
  return normalizeFileTemplateTabTags(tags).flatMap((tag) => {
    const tab = createTagFilterFileTemplateTab(tag);
    return tab ? [tab] : [];
  });
}

export function normalizeFileTemplateLibraryPaths(value: unknown): string[] {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\n,，]+/) : [];
  const seen = new Set<string>();
  return source.flatMap((item) => {
    const normalized = normalizeOptionalVaultPath(item);
    if (!normalized || seen.has(normalized)) {
      return [];
    }
    seen.add(normalized);
    return [normalized];
  });
}

export function normalizeFileTemplateDefaults(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }
  const result: Record<string, string> = {};
  for (const [rawTag, rawPath] of Object.entries(value)) {
    const tag = normalizeFileTag(rawTag);
    const path = normalizeOptionalVaultPath(rawPath);
    if (!tag || !path) {
      continue;
    }
    result[tag] = path;
  }
  return result;
}

export function normalizeFileTemplateLibraryFolder(value: unknown): string {
  return normalizeOptionalVaultPath(value) || DEFAULT_FILE_TEMPLATE_LIBRARY_FOLDER;
}

export function normalizeFileTemplateLibraryDefaultFolder(value: unknown): string {
  return normalizeOptionalVaultPath(value) || DEFAULT_FILE_TEMPLATE_LIBRARY_TARGET_FOLDER;
}

export function filterFileTemplateLibraryItems(items: FileTemplateLibraryItem[], filter: FileTemplateLibraryFilter = {}): FileTemplateLibraryItem[] {
  const query = (filter.query ?? "").trim().toLowerCase();
  const category = (filter.category ?? "").trim();
  return items
    .filter((item) => {
      if (category === "最近" && !item.isRecent) {
        return false;
      }
      if (category && category !== "全部" && category !== "最近" && item.category !== category) {
        return false;
      }
      if (!query) {
        return true;
      }
      const haystack = `${item.name} ${item.path} ${item.category} ${item.tags.join(" ")}`.toLowerCase();
      return haystack.includes(query);
    })
    .sort((left, right) => {
      if (left.isRecent !== right.isRecent) {
        return left.isRecent ? -1 : 1;
      }
      return right.updatedAt - left.updatedAt || left.name.localeCompare(right.name);
    });
}

export function filterFileTemplateLibraryItemsForTab(
  items: FileTemplateLibraryItem[],
  tab: FileTemplateTab,
  query = ""
): FileTemplateLibraryItem[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (tab.type === "tag-filter") {
    const tags = new Set(tab.tags.map((tag) => normalizeFileTag(tag)).filter(Boolean));
    return filterFileTemplateLibraryItems(items, { query: normalizedQuery, category: "全部" }).filter((item) =>
      item.tags.some((tag) => tags.has(normalizeFileTag(tag)))
    );
  }

  const byPath = new Map(items.map((item) => [normalizeOptionalVaultPath(item.path), item]));
  return normalizeFileTemplateLibraryPaths(tab.templatePaths)
    .flatMap((path) => {
      const item = byPath.get(path);
      if (!item) {
        return [];
      }
      if (!normalizedQuery) {
        return [item];
      }
      const haystack = `${item.name} ${item.path} ${item.category} ${item.tags.join(" ")}`.toLowerCase();
      return haystack.includes(normalizedQuery) ? [item] : [];
    });
}

export function addTemplatePathToFileTemplateTab(tabs: FileTemplateTab[], tabId: string, templatePath: string): FileTemplateTab[] {
  const normalizedPath = normalizeOptionalVaultPath(templatePath);
  if (!normalizedPath) {
    return normalizeFileTemplateTabs(tabs);
  }
  return normalizeFileTemplateTabs(tabs).map((tab) => {
    if (tab.id !== tabId || tab.type !== "template-group" || tab.templatePaths.includes(normalizedPath)) {
      return tab;
    }
    return { ...tab, templatePaths: [...tab.templatePaths, normalizedPath] };
  });
}

export async function scanFileTemplateLibrary(app: App, settings: FileTemplateLibrarySettings): Promise<FileTemplateLibraryItem[]> {
  const folder = normalizeFileTemplateLibraryFolder(settings.fileTemplateLibraryFolder);
  const recent = new Set(normalizeFileTemplateLibraryPaths(settings.fileTemplateLibraryRecent));
  const files = templateFilesInFolder(app, folder).sort((left, right) => left.path.localeCompare(right.path));

  return files.map((file) => {
    const path = normalizePath(file.path);
    return {
      path,
      name: file.basename || file.name.replace(/\.md$/i, ""),
      category: categoryForTemplatePath(path, folder),
      tags: collectTemplateTags(app, file),
      updatedAt: file.stat?.mtime ?? 0,
      isRecent: recent.has(path),
      file
    };
  });
}

function templateFilesInFolder(app: App, folderPath: string): TFile[] {
  const folder = app.vault.getAbstractFileByPath(folderPath);
  const files: TFile[] = [];
  const standalone = app.vault.getAbstractFileByPath(`${folderPath}.md`);
  if (standalone instanceof TFile && standalone.extension === "md") {
    files.push(standalone);
  }
  if (!(folder instanceof TFolder)) {
    return files;
  }
  const pending = [...folder.children];
  while (pending.length > 0) {
    const entry = pending.pop();
    if (entry instanceof TFolder) {
      pending.push(...entry.children);
    } else if (entry instanceof TFile && entry.extension === "md") {
      files.push(entry);
    }
  }
  return files;
}

export function buildFileTemplateTargetPath(folder: string, title: string): string {
  const normalizedFolder = normalizeFileTemplateLibraryDefaultFolder(folder);
  const filename = stripMarkdownExtension(sanitizeFileName(title)) || "未命名";
  return normalizePath(`${normalizedFolder}/${filename}.md`);
}

export function renderFileTemplateContent(templateSource: string, context: TemplateVariableContext): string {
  const title = context.title.trim() || "未命名";
  const rendered = templateSource.trim()
    ? renderTemplateVariables(templateSource, { ...context, title })
    : buildDefaultFileTemplateContent({ ...context, title });
  return finalizeFileTemplateContent(rendered, context.tag);
}

export function finalizeFileTemplateContent(source: string, tag?: string): string {
  return ensureTrailingNewline(ensureTagInMarkdown(source, tag));
}

export function updateRecentFileTemplatePaths(paths: string[], path: string): string[] {
  const normalized = normalizeOptionalVaultPath(path);
  if (!normalized) {
    return normalizeFileTemplateLibraryPaths(paths).slice(0, FILE_TEMPLATE_LIBRARY_RECENT_LIMIT);
  }
  return [normalized, ...normalizeFileTemplateLibraryPaths(paths).filter((item) => item !== normalized)].slice(0, FILE_TEMPLATE_LIBRARY_RECENT_LIMIT);
}

function buildDefaultFileTemplateContent(context: TemplateVariableContext): string {
  const tag = normalizeFileTag(context.tag);
  const frontmatter = tag ? ["---", "tags:", `  - ${tag}`, "---", ""] : [];
  return [...frontmatter, `# ${context.title.trim() || "未命名"}`, "", "## 收集箱", "", context.content?.trim() ?? ""].join("\n");
}

function normalizeFileTemplateTabTags(value: unknown): string[] {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\n,，\s]+/) : [];
  const seen = new Set<string>();
  return source.flatMap((item) => {
    const tag = normalizeFileTag(item);
    if (!tag || seen.has(tag)) {
      return [];
    }
    seen.add(tag);
    return [tag];
  });
}

function normalizeFileTemplateTabName(value: unknown, type: FileTemplateTabType, tags: string[]): string {
  const name = normalizeText(value);
  if (name) {
    return name;
  }
  if (type === "tag-filter") {
    return tags[0] ?? "";
  }
  return "";
}

function normalizeFileTemplateTabId(
  value: unknown,
  type: FileTemplateTabType,
  name: string,
  tags: string[],
  seen: Set<string>
): string {
  const explicit = normalizeText(value);
  const seed = explicit || (type === "tag-filter" ? tags[0] : uniqueTabSeed("group", name));
  if (!seed) {
    return "";
  }
  let id = seed.replace(/\s+/g, "-");
  let index = 2;
  while (seen.has(id)) {
    id = `${seed}-${index}`;
    index += 1;
  }
  return id;
}

function uniqueTabSeed(prefix: string, value: string): string {
  return `${prefix}-${value.trim().replace(/\s+/g, "-")}`;
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function ensureTagInMarkdown(source: string, rawTag: unknown): string {
  const tag = normalizeFileTag(rawTag);
  if (!tag) {
    return source;
  }
  if (markdownAlreadyHasTag(source, tag)) {
    return source;
  }
  const normalized = source.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return ["---", "tags:", `  - ${tag}`, "---", "", normalized].join("\n");
  }
  const closingIndex = normalized.indexOf("\n---", 4);
  if (closingIndex < 0) {
    return ["---", "tags:", `  - ${tag}`, "---", "", normalized.replace(/^---\n/, "")].join("\n");
  }
  const frontmatter = normalized.slice(4, closingIndex);
  const body = normalized.slice(closingIndex);
  if (/^tags:\s*\[[^\]]*\]/m.test(frontmatter)) {
    const nextFrontmatter = frontmatter.replace(/^tags:\s*\[([^\]]*)\]/m, (_, current: string) => {
      const prefix = current.trim() ? `${current.trim().replace(/,\s*$/, "")}, ` : "";
      return `tags: [${prefix}${tag}]`;
    });
    return `---\n${nextFrontmatter}${body}`;
  }
  if (/^tags:\s*$/m.test(frontmatter)) {
    const nextFrontmatter = frontmatter.replace(/^tags:\s*$/m, `tags:\n  - ${tag}`);
    return `---\n${nextFrontmatter}${body}`;
  }
  return `---\n${frontmatter.replace(/\n*$/, "\n")}tags:\n  - ${tag}${body}`;
}

function markdownAlreadyHasTag(source: string, tag: string): boolean {
  const escaped = escapeRegExp(tag);
  return new RegExp(`(^|[\\s\\[,'":：-])#?${escaped}($|[\\s\\],'"-])`, "i").test(source);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function collectTemplateTags(app: App, file: TFile): string[] {
  const cache = app.metadataCache.getFileCache(file);
  const tags = new Set<string>();
  const frontmatter = cache?.frontmatter;
  collectFrontmatterTags(frontmatter?.tags, tags);
  collectFrontmatterTags(frontmatter?.tag, tags);
  for (const item of cache?.tags ?? []) {
    const tag = normalizeFileTag(item.tag);
    if (tag) {
      tags.add(tag);
    }
  }
  return [...tags].sort((left, right) => left.localeCompare(right));
}

function collectFrontmatterTags(value: unknown, tags: Set<string>): void {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\n,，\s]+/) : [];
  for (const item of source) {
    const tag = normalizeFileTag(item);
    if (tag) {
      tags.add(tag);
    }
  }
}

function categoryForTemplatePath(path: string, root: string): string {
  const relative = path === `${root}.md` ? path.split("/").pop() ?? path : path.slice(root.length + 1);
  const parts = relative.split("/").filter(Boolean);
  if (parts.length > 1) {
    return parts[0];
  }
  return "未分类";
}

function normalizeOptionalVaultPath(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? normalizePath(text) : "";
}

function sanitizeFileName(value: string): string {
  return value
    .trim()
    .replace(/[\\/:*?"<>|#^[\]]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripMarkdownExtension(value: string): string {
  return value.replace(/\.md$/i, "").trim();
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
