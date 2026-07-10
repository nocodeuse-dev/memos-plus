import { getAllTags, normalizePath, TFile } from "obsidian";
import type { App, CachedMetadata } from "obsidian";
import type { FileHeadingInfo, TaggedFileInfo } from "./fileSend";
import type { FileTemplateLibraryItem, FileTemplateLibrarySettings } from "./fileTemplateLibrary";
import type { ProjectInfo, ProjectInfoOptions, ProjectStatus } from "./projectSend";

export interface VaultIndexFile {
  file: TFile;
  path: string;
  name: string;
  basename: string;
  mtime: number;
  tags: string[];
  frontmatter?: Record<string, unknown>;
  headings: FileHeadingInfo[];
  status?: string;
  hasImage: boolean;
  hasLink: boolean;
}

export class VaultMetadataIndex {
  private entriesByPath: Map<string, VaultIndexFile> | null = null;

  constructor(private readonly app: App) {}

  invalidate(path?: string): void {
    if (!path) {
      this.entriesByPath = null;
      return;
    }
    const normalized = normalizePath(path);
    if (!this.entriesByPath) {
      return;
    }
    const file = this.app.vault.getAbstractFileByPath(normalized);
    if (file instanceof TFile && file.extension === "md") {
      this.entriesByPath.set(normalized, this.buildEntry(file));
      return;
    }
    this.entriesByPath.delete(normalized);
  }

  getEntries(): VaultIndexFile[] {
    return Array.from(this.entries().values());
  }

  getEntry(fileOrPath: TFile | string): VaultIndexFile | undefined {
    const path = typeof fileOrPath === "string" ? normalizePath(fileOrPath) : normalizePath(fileOrPath.path);
    return this.entries().get(path);
  }

  getAllTagOptions(): string[] {
    const tags = new Set<string>();
    for (const entry of this.scanEntries()) {
      for (const tag of entry.tags) {
        tags.add(tag);
      }
    }
    return Array.from(tags).sort(compareTagNames);
  }

  getTaggedFileInfos(tagQuery: string): TaggedFileInfo[] {
    const query = normalizeFileTag(tagQuery);
    if (!query) {
      return [];
    }
    const result: TaggedFileInfo[] = [];
    for (const entry of this.scanEntries()) {
      const matchTags = entry.tags.filter((tag) => tagMatchesQuery(tag, query));
      if (matchTags.length > 0) {
        result.push(taggedFileInfoFromEntry(entry, matchTags));
      }
    }
    return result.sort((left, right) => {
      const leftScore = Math.min(...left.matchTags.map((tag) => tagMatchScore(tag, query)));
      const rightScore = Math.min(...right.matchTags.map((tag) => tagMatchScore(tag, query)));
      return leftScore - rightScore || right.updatedAt - left.updatedAt || left.name.localeCompare(right.name) || left.path.localeCompare(right.path);
    });
  }

  searchMarkdownFileInfos(query: string): TaggedFileInfo[] {
    const normalizedQuery = query.trim().toLowerCase();
    const result: TaggedFileInfo[] = [];
    for (const entry of this.scanEntries()) {
      if (!normalizedQuery || `${entry.basename} ${entry.path}`.toLowerCase().includes(normalizedQuery)) {
        result.push(taggedFileInfoFromEntry(entry, []));
      }
    }
    return result.sort((left, right) => right.updatedAt - left.updatedAt || left.name.localeCompare(right.name) || left.path.localeCompare(right.path));
  }

  getRecentFileInfos(paths: string[]): TaggedFileInfo[] {
    const result: TaggedFileInfo[] = [];
    for (const path of paths.map((item) => normalizePath(item)).filter(Boolean)) {
      const entry = this.buildEntryForPath(path);
      if (entry) {
        result.push(taggedFileInfoFromEntry(entry, []));
      }
    }
    return result;
  }

  getProjectFiles(projectTag: string): TFile[] {
    const normalizedTag = normalizeProjectTag(projectTag);
    if (!normalizedTag) {
      return [];
    }
    const result: TFile[] = [];
    for (const entry of this.scanEntries()) {
      if (entry.tags.some((tag) => normalizeProjectTag(tag) === normalizedTag)) {
        result.push(entry.file);
      }
    }
    return result.sort((left, right) => left.basename.localeCompare(right.basename) || left.path.localeCompare(right.path));
  }

  getProjectInfos(projectTag: string, options: ProjectInfoOptions): ProjectInfo[] {
    const normalizedTag = normalizeProjectTag(projectTag);
    if (!normalizedTag) {
      return [];
    }
    const recentRank = new Map(options.recentProjectPaths.slice(0, 5).map((path, index) => [normalizePath(path), index]));
    const result: ProjectInfo[] = [];
    for (const entry of this.scanEntries()) {
      if (!entry.tags.some((tag) => normalizeProjectTag(tag) === normalizedTag)) {
        continue;
      }
      const status = normalizeProjectStatus(entry.status) ?? "进行中";
      result.push({
        file: entry.file,
        name: entry.basename,
        status,
        updatedAt: entry.mtime,
        isRecent: recentRank.has(entry.path)
      });
    }
    return result
      .filter((project) => options.showArchivedProjects || (project.status !== "完成" && project.status !== "归档"))
      .sort((left, right) => {
        const leftRecent = recentRank.get(normalizePath(left.file.path));
        const rightRecent = recentRank.get(normalizePath(right.file.path));
        if (leftRecent !== undefined || rightRecent !== undefined) {
          return (leftRecent ?? Number.MAX_SAFE_INTEGER) - (rightRecent ?? Number.MAX_SAFE_INTEGER);
        }
        return right.updatedAt - left.updatedAt || left.name.localeCompare(right.name) || left.file.path.localeCompare(right.file.path);
      });
  }

  getFileHeadings(fileOrPath: TFile | string): FileHeadingInfo[] {
    return this.buildEntryForPath(fileOrPath)?.headings ?? [];
  }

  scanFileTemplateLibrary(settings: FileTemplateLibrarySettings): FileTemplateLibraryItem[] {
    const folder = normalizeOptionalVaultPath(settings.fileTemplateLibraryFolder) || "我的资源/模板";
    const prefix = folder ? `${folder}/` : "";
    const recent = new Set(normalizeVaultPaths(settings.fileTemplateLibraryRecent));
    const result: FileTemplateLibraryItem[] = [];
    for (const entry of this.scanEntries()) {
      const path = entry.path;
      if (!(path === `${folder}.md` || (prefix ? path.startsWith(prefix) : true))) {
        continue;
      }
      result.push({
        path: entry.path,
        name: entry.basename || entry.name.replace(/\.md$/i, ""),
        category: categoryForTemplatePath(entry.path, folder),
        tags: [...entry.tags].sort(compareTagNames),
        updatedAt: entry.mtime,
        isRecent: recent.has(entry.path),
        file: entry.file
      });
    }
    return result.sort((left, right) => left.path.localeCompare(right.path));
  }

  private *scanEntries(): Iterable<VaultIndexFile> {
    for (const entry of this.entries().values()) {
      yield entry;
    }
  }

  private buildEntryForPath(fileOrPath: TFile | string): VaultIndexFile | undefined {
    const file = typeof fileOrPath === "string" ? this.app.vault.getAbstractFileByPath(normalizePath(fileOrPath)) : fileOrPath;
    if (file instanceof TFile && file.extension === "md") {
      return this.buildEntry(file);
    }
    return undefined;
  }

  private entries(): Map<string, VaultIndexFile> {
    if (!this.entriesByPath) {
      this.entriesByPath = new Map(this.app.vault.getMarkdownFiles().map((file) => [normalizePath(file.path), this.buildEntry(file)]));
    }
    return this.entriesByPath;
  }

  private buildEntry(file: TFile): VaultIndexFile {
    const cache = this.app.metadataCache.getFileCache(file);
    const frontmatter = isRecord(cache?.frontmatter) ? cache?.frontmatter : undefined;
    return {
      file,
      path: normalizePath(file.path),
      name: file.name,
      basename: file.basename || file.name.replace(/\.md$/i, ""),
      mtime: file.stat?.mtime ?? 0,
      tags: collectMetadataTags(cache),
      frontmatter,
      headings: collectHeadings(cache),
      status: fileStatusFromCache(cache),
      hasImage: metadataHasImage(cache),
      hasLink: metadataHasLink(cache)
    };
  }
}

function taggedFileInfoFromEntry(entry: VaultIndexFile, matchTags: string[]): TaggedFileInfo {
  return {
    file: entry.file,
    name: entry.basename,
    path: entry.path,
    tags: entry.tags,
    matchTags,
    status: entry.status,
    updatedAt: entry.mtime
  };
}

function collectMetadataTags(cache: CachedMetadata | null | undefined): string[] {
  if (!cache) {
    return [];
  }
  const tags = new Set<string>();
  collectFrontmatterTags(cache.frontmatter?.tags, tags);
  collectFrontmatterTags(cache.frontmatter?.tag, tags);
  for (const tag of getAllTags(cache) ?? []) {
    addNormalizedTag(tags, tag);
  }
  return Array.from(tags);
}

function collectFrontmatterTags(value: unknown, tags: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectFrontmatterTags(item, tags);
    }
    return;
  }
  if (typeof value === "string") {
    for (const tag of value.split(/[\s,，]+/)) {
      addNormalizedTag(tags, tag);
    }
  }
}

function addNormalizedTag(tags: Set<string>, value: unknown): void {
  const normalized = normalizeFileTag(value);
  if (normalized) {
    tags.add(normalized);
  }
}

function collectHeadings(cache: CachedMetadata | null | undefined): FileHeadingInfo[] {
  return (cache?.headings ?? []).flatMap((heading) => {
    const line = heading.position?.start?.line;
    if (typeof line !== "number") {
      return [];
    }
    return [{ heading: heading.heading, level: heading.level, line }];
  });
}

function fileStatusFromCache(cache: CachedMetadata | null | undefined): string | undefined {
  const frontmatter = cache?.frontmatter as Record<string, unknown> | undefined;
  const raw = frontmatter?.status ?? frontmatter?.projectStatus ?? frontmatter?.["项目状态"];
  if (typeof raw === "string" && raw.trim()) {
    return raw.trim();
  }
  if (!cache) {
    return undefined;
  }
  for (const tag of getAllTags(cache) ?? []) {
    const last = normalizeFileTag(tag).split("/").pop();
    if (last && ["进行中", "暂停", "完成", "已完成", "归档"].includes(last)) {
      return last;
    }
  }
  return undefined;
}

function metadataHasImage(cache: CachedMetadata | null | undefined): boolean {
  return (cache?.embeds ?? []).some((embed) => /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(embed.link));
}

function metadataHasLink(cache: CachedMetadata | null | undefined): boolean {
  return (cache?.links ?? []).length > 0 || (cache?.embeds ?? []).length > 0;
}

function normalizeFileTag(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/^#+/, "").replace(/\s+/g, "") : "";
}

function normalizeProjectTag(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/^#+/, "").replace(/\s+/g, "") : "";
}

function tagMatchesQuery(tag: string, query: string): boolean {
  return normalizeFileTag(tag).includes(query);
}

function tagMatchScore(tag: string, query: string): number {
  const normalized = normalizeFileTag(tag);
  if (normalized === query) {
    return 0;
  }
  if (normalized.split("/").some((part) => part === query)) {
    return 1;
  }
  if (normalized.startsWith(query) || normalized.endsWith(query)) {
    return 2;
  }
  return 3;
}

function normalizeProjectStatus(value: unknown): ProjectStatus | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (["暂停", "paused", "pause"].includes(normalized)) {
    return "暂停";
  }
  if (["完成", "已完成", "done", "completed", "complete"].includes(normalized)) {
    return "完成";
  }
  if (["归档", "archive", "archived"].includes(normalized)) {
    return "归档";
  }
  if (["进行中", "active", "doing", "in-progress", "in progress"].includes(normalized)) {
    return "进行中";
  }
  return null;
}

function normalizeVaultPaths(value: unknown): string[] {
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

function normalizeOptionalVaultPath(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? normalizePath(text) : "";
}

function categoryForTemplatePath(path: string, root: string): string {
  const relative = path === `${root}.md` ? path.split("/").pop() ?? path : path.slice(root.length + 1);
  const parts = relative.split("/").filter(Boolean);
  return parts.length > 1 ? parts[0] : "未分类";
}

function compareTagNames(left: string, right: string): number {
  return left.localeCompare(right, "zh-Hans-CN");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
