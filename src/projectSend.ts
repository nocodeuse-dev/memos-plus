import { getAllTags, normalizePath } from "obsidian";
import type { App, CachedMetadata, TFile } from "obsidian";

export type ProjectInsertResult = "inserted" | "missing-heading";
export type ProjectStatus = "进行中" | "暂停" | "完成" | "归档";

export interface ProjectInfo {
  file: TFile;
  name: string;
  status: ProjectStatus;
  updatedAt: number;
  isRecent: boolean;
}

export interface ProjectInfoOptions {
  recentProjectPaths: string[];
  showArchivedProjects: boolean;
}

export async function getProjectFiles(app: App, projectTag: string): Promise<TFile[]> {
  const normalizedTag = normalizeProjectTag(projectTag);
  if (!normalizedTag) {
    return [];
  }

  return app.vault
    .getMarkdownFiles()
    .filter((file) => {
      const cache = app.metadataCache.getFileCache(file);
      return cache ? metadataHasTag(cache, normalizedTag) : false;
    })
    .sort((left, right) => left.basename.localeCompare(right.basename) || left.path.localeCompare(right.path));
}

export async function getProjectInfos(app: App, projectTag: string, options: ProjectInfoOptions): Promise<ProjectInfo[]> {
  const recentRank = new Map(options.recentProjectPaths.slice(0, 5).map((path, index) => [normalizePath(path), index]));
  return (await getProjectFiles(app, projectTag))
    .map((file) => {
      const cache = app.metadataCache.getFileCache(file);
      const status = cache ? projectStatusFromCache(cache) : "进行中";
      return {
        file,
        name: file.basename,
        status,
        updatedAt: file.stat?.mtime ?? 0,
        isRecent: recentRank.has(normalizePath(file.path))
      };
    })
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

export async function insertContentUnderHeading(
  app: App,
  file: TFile,
  headingText: string,
  contentToInsert: string,
  createHeadingIfMissing: boolean
): Promise<ProjectInsertResult> {
  const normalizedHeading = normalizeConfiguredHeadingText(headingText);
  const contentLines = trimOuterBlankLines(normalizeNewlines(contentToInsert).split("\n"));
  if (!normalizedHeading || contentLines.length === 0) {
    return "missing-heading";
  }

  let result: ProjectInsertResult = "missing-heading";
  await app.vault.process(file, (source) => {
    const nextSource = insertIntoSource(source, normalizedHeading, contentLines, createHeadingIfMissing);
    result = nextSource ? "inserted" : "missing-heading";
    return nextSource ?? source;
  });

  return result;
}

export function buildProjectFileContent(projectName: string, projectTag: string, sections: string[]): string {
  const name = sanitizeProjectName(projectName);
  const tag = normalizeProjectTag(projectTag) || "项目";
  const headings = normalizeSectionList(sections).map((section) => `## ${section}\n`).join("\n");
  return `---\ntags:\n  - ${tag}\nstatus: 进行中\n---\n\n# ${name}\n\n${headings}`;
}

export function projectPathForName(folderPath: string, projectName: string, existingPaths: Set<string>): string {
  const folder = normalizePath(folderPath.trim() || "项目");
  const baseName = sanitizeProjectName(projectName);
  const normalizedExisting = new Set(Array.from(existingPaths, (path) => normalizePath(path)));
  for (let index = 1; index < 1000; index++) {
    const suffix = index === 1 ? "" : ` ${index}`;
    const path = normalizePath(`${folder}/${baseName}${suffix}.md`);
    if (!normalizedExisting.has(path)) {
      return path;
    }
  }
  return normalizePath(`${folder}/${baseName}-${Date.now().toString(36)}.md`);
}

export function updateRecentProjectPaths(current: string[], selectedPath: string, limit = 5): string[] {
  const normalizedSelected = normalizePath(selectedPath);
  return [normalizedSelected, ...current.map((path) => normalizePath(path)).filter((path) => path && path !== normalizedSelected)].slice(0, limit);
}

export function normalizeProjectTag(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/^#+/, "").replace(/\s+/g, "") : "";
}

function insertIntoSource(source: string, headingText: string, contentLines: string[], createHeadingIfMissing: boolean): string | null {
  const normalized = normalizeNewlines(source).replace(/\n*$/, "");
  const lines = normalized ? normalized.split("\n") : [];
  const headingIndex = lines.findIndex((line) => normalizeMarkdownHeadingText(line) === headingText);

  if (headingIndex >= 0) {
    let insertAt = headingIndex + 1;
    let hasBlankAfterHeading = false;
    while (insertAt < lines.length && lines[insertAt].trim() === "") {
      hasBlankAfterHeading = true;
      insertAt++;
    }
    lines.splice(insertAt, 0, ...(hasBlankAfterHeading ? [] : [""]), ...contentLines, "");
    return `${lines.join("\n")}\n`;
  }

  if (!createHeadingIfMissing) {
    return null;
  }

  const headingBlock = [`## ${headingText}`, "", ...contentLines];
  return lines.length > 0 ? `${lines.join("\n")}\n\n${headingBlock.join("\n")}\n` : `${headingBlock.join("\n")}\n`;
}

function frontmatterHasTag(value: unknown, projectTag: string): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => normalizeProjectTag(item) === projectTag);
  }
  if (typeof value === "string") {
    return value.split(/[\s,，]+/).some((item) => normalizeProjectTag(item) === projectTag);
  }
  return false;
}

function metadataHasTag(cache: CachedMetadata, projectTag: string): boolean {
  if (frontmatterHasTag(cache.frontmatter?.tags, projectTag)) {
    return true;
  }
  return (getAllTags(cache) ?? []).some((tag) => normalizeProjectTag(tag) === projectTag);
}

function projectStatusFromCache(cache: CachedMetadata): ProjectStatus {
  const frontmatter = cache.frontmatter as Record<string, unknown> | undefined;
  const frontmatterStatus = normalizeProjectStatus(frontmatter?.status ?? frontmatter?.projectStatus ?? frontmatter?.["项目状态"]);
  if (frontmatterStatus) {
    return frontmatterStatus;
  }
  for (const tag of getAllTags(cache) ?? []) {
    const status = normalizeProjectStatus(normalizeProjectTag(tag).split("/").pop());
    if (status) {
      return status;
    }
  }
  return "进行中";
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

function sanitizeProjectName(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim() || "未命名项目";
}

function normalizeSectionList(sections: string[]): string[] {
  const seen = new Set<string>();
  return sections.flatMap((section) => {
    const normalized = section.trim();
    if (!normalized || seen.has(normalized)) {
      return [];
    }
    seen.add(normalized);
    return [normalized];
  });
}

function normalizeConfiguredHeadingText(value: string): string {
  const match = value.match(markdownHeadingExpression);
  return (match?.[1] ?? value).trim();
}

function normalizeMarkdownHeadingText(value: string): string | null {
  const match = value.match(markdownHeadingExpression);
  return match ? match[1].trim() : null;
}

function trimOuterBlankLines(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === "") {
    start++;
  }
  while (end > start && lines[end - 1].trim() === "") {
    end--;
  }
  return lines.slice(start, end);
}

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

const markdownHeadingExpression = /^\s{0,3}#{1,6}[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/;
