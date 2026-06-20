import { App, TFile, normalizePath } from "obsidian";
import { normalizeFileTag } from "./fileSend";
import { renderTemplateVariables, type TemplateVariableContext } from "./templateManager";

export const DEFAULT_FILE_TEMPLATE_LIBRARY_FOLDER = "我的资源/模板";
export const DEFAULT_FILE_TEMPLATE_LIBRARY_TARGET_FOLDER = "我的资源/Memos";
export const FILE_TEMPLATE_LIBRARY_RECENT_LIMIT = 20;

export interface FileTemplateLibraryItem {
  path: string;
  name: string;
  category: string;
  tags: string[];
  updatedAt: number;
  isFavorite: boolean;
  isRecent: boolean;
  file?: TFile;
}

export interface FileTemplateLibraryFilter {
  query?: string;
  category?: string;
}

export interface FileTemplateLibrarySettings {
  fileTemplateLibraryFolder: string;
  fileTemplateLibraryDefaultFolder: string;
  fileTemplateLibraryFavorites: string[];
  fileTemplateLibraryRecent: string[];
  fileTemplateLibraryDefaults: Record<string, string>;
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
      if (category === "收藏" && !item.isFavorite) {
        return false;
      }
      if (category === "最近" && !item.isRecent) {
        return false;
      }
      if (category && category !== "全部" && category !== "收藏" && category !== "最近" && item.category !== category) {
        return false;
      }
      if (!query) {
        return true;
      }
      const haystack = `${item.name} ${item.path} ${item.category} ${item.tags.join(" ")}`.toLowerCase();
      return haystack.includes(query);
    })
    .sort((left, right) => {
      if (left.isFavorite !== right.isFavorite) {
        return left.isFavorite ? -1 : 1;
      }
      if (left.isRecent !== right.isRecent) {
        return left.isRecent ? -1 : 1;
      }
      return right.updatedAt - left.updatedAt || left.name.localeCompare(right.name);
    });
}

export async function scanFileTemplateLibrary(app: App, settings: FileTemplateLibrarySettings): Promise<FileTemplateLibraryItem[]> {
  const folder = normalizeFileTemplateLibraryFolder(settings.fileTemplateLibraryFolder);
  const prefix = folder ? `${folder}/` : "";
  const favorites = new Set(normalizeFileTemplateLibraryPaths(settings.fileTemplateLibraryFavorites));
  const recent = new Set(normalizeFileTemplateLibraryPaths(settings.fileTemplateLibraryRecent));
  const files = app.vault
    .getMarkdownFiles()
    .filter((file) => {
      const path = normalizePath(file.path);
      return path === `${folder}.md` || (prefix ? path.startsWith(prefix) : true);
    })
    .sort((left, right) => left.path.localeCompare(right.path));

  return files.map((file) => {
    const path = normalizePath(file.path);
    return {
      path,
      name: file.basename || file.name.replace(/\.md$/i, ""),
      category: categoryForTemplatePath(path, folder),
      tags: collectTemplateTags(app, file),
      updatedAt: file.stat?.mtime ?? 0,
      isFavorite: favorites.has(path),
      isRecent: recent.has(path),
      file
    };
  });
}

export function buildFileTemplateTargetPath(folder: string, title: string): string {
  const normalizedFolder = normalizeFileTemplateLibraryDefaultFolder(folder);
  const filename = sanitizeFileName(title) || "未命名";
  return normalizePath(`${normalizedFolder}/${filename}.md`);
}

export function renderFileTemplateContent(templateSource: string, context: TemplateVariableContext): string {
  const title = context.title.trim() || "未命名";
  const rendered = templateSource.trim()
    ? renderTemplateVariables(templateSource, { ...context, title })
    : buildDefaultFileTemplateContent({ ...context, title });
  return ensureTrailingNewline(ensureTagInMarkdown(rendered, context.tag));
}

export function updateRecentFileTemplatePaths(paths: string[], path: string): string[] {
  const normalized = normalizeOptionalVaultPath(path);
  if (!normalized) {
    return normalizeFileTemplateLibraryPaths(paths).slice(0, FILE_TEMPLATE_LIBRARY_RECENT_LIMIT);
  }
  return [normalized, ...normalizeFileTemplateLibraryPaths(paths).filter((item) => item !== normalized)].slice(0, FILE_TEMPLATE_LIBRARY_RECENT_LIMIT);
}

export function toggleFavoriteFileTemplatePath(paths: string[], path: string): string[] {
  const normalized = normalizeOptionalVaultPath(path);
  const current = normalizeFileTemplateLibraryPaths(paths);
  if (!normalized) {
    return current;
  }
  return current.includes(normalized) ? current.filter((item) => item !== normalized) : [...current, normalized];
}

function buildDefaultFileTemplateContent(context: TemplateVariableContext): string {
  const tag = normalizeFileTag(context.tag);
  const frontmatter = tag ? ["---", "tags:", `  - ${tag}`, "---", ""] : [];
  return [...frontmatter, `# ${context.title.trim() || "未命名"}`, "", "## 收集箱", "", context.content?.trim() ?? ""].join("\n");
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

function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
