import { TFile, getAllTags, normalizePath } from "obsidian";
import type { App, CachedMetadata } from "obsidian";

export type FileInsertPosition = "heading-top" | "heading-bottom" | "file-end" | "file-start" | "new-heading";
export type NewHeadingPosition = "file-end" | "file-start" | "after-current-heading";
export type ExistingHeadingBehavior = "use-existing" | "create-duplicate" | "cancel";
export type MarkdownHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;
export type NoHeadingBehavior = "ask" | "file-end" | "file-start";

export interface TaggedFileInfo {
  file: TFile;
  name: string;
  path: string;
  tags: string[];
  matchTags: string[];
  status?: string;
  updatedAt: number;
}

export interface FileHeadingInfo {
  heading: string;
  level: number;
  line: number;
}

export interface FileSendTarget {
  heading?: string;
  position: FileInsertPosition;
  createHeadingIfMissing?: boolean;
  newHeadingName?: string;
  newHeadingLevel?: MarkdownHeadingLevel;
  newHeadingPosition?: NewHeadingPosition;
  existingHeadingBehavior?: ExistingHeadingBehavior;
}

export interface FileInsertCursor {
  line: number;
  ch: number;
  fallbackToFileEnd: boolean;
}

export const DEFAULT_SEND_TO_FILE_COMMON_TAGS = ["病", "插件", "病例", "医学", "康复", "资料"];

export async function getAllTagOptions(app: App): Promise<string[]> {
  const tags = new Set<string>();
  for (const file of app.vault.getMarkdownFiles()) {
    const cache = app.metadataCache.getFileCache(file);
    for (const tag of collectMetadataTags(cache)) {
      tags.add(tag);
    }
  }
  return Array.from(tags).sort(compareTagNames);
}

export async function getTaggedFileInfos(app: App, tagQuery: string): Promise<TaggedFileInfo[]> {
  const query = normalizeFileTag(tagQuery);
  if (!query) {
    return [];
  }
  return app.vault
    .getMarkdownFiles()
    .flatMap((file) => {
      const cache = app.metadataCache.getFileCache(file);
      const tags = collectMetadataTags(cache);
      const matchTags = tags.filter((tag) => tagMatchesQuery(tag, query));
      if (matchTags.length === 0) {
        return [];
      }
      return [fileInfoFromFile(file, tags, matchTags, cache)];
    })
    .sort((left, right) => {
      const leftScore = Math.min(...left.matchTags.map((tag) => tagMatchScore(tag, query)));
      const rightScore = Math.min(...right.matchTags.map((tag) => tagMatchScore(tag, query)));
      return leftScore - rightScore || right.updatedAt - left.updatedAt || left.name.localeCompare(right.name) || left.path.localeCompare(right.path);
    });
}

export async function searchMarkdownFileInfos(app: App, query: string): Promise<TaggedFileInfo[]> {
  const normalizedQuery = query.trim().toLowerCase();
  return app.vault
    .getMarkdownFiles()
    .filter((file) => !normalizedQuery || `${file.basename} ${file.path}`.toLowerCase().includes(normalizedQuery))
    .map((file) => {
      const cache = app.metadataCache.getFileCache(file);
      const tags = collectMetadataTags(cache);
      return fileInfoFromFile(file, tags, [], cache);
    })
    .sort((left, right) => right.updatedAt - left.updatedAt || left.name.localeCompare(right.name) || left.path.localeCompare(right.path));
}

export async function getRecentFileInfos(app: App, paths: string[]): Promise<TaggedFileInfo[]> {
  const result: TaggedFileInfo[] = [];
  for (const path of paths.map((item) => normalizePath(item)).filter(Boolean)) {
    const file = app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile) || file.extension !== "md") {
      continue;
    }
    const cache = app.metadataCache.getFileCache(file);
    const tags = collectMetadataTags(cache);
    result.push(fileInfoFromFile(file, tags, [], cache));
  }
  return result;
}

export async function getFileHeadings(app: App, file: TFile): Promise<FileHeadingInfo[]> {
  const cache = app.metadataCache.getFileCache(file);
  const cachedHeadings = cache?.headings ?? [];
  if (cachedHeadings.length > 0) {
    return cachedHeadings.flatMap((heading) => {
      const line = heading.position?.start?.line;
      if (typeof line !== "number") {
        return [];
      }
      return [
        {
          heading: heading.heading,
          level: heading.level,
          line
        }
      ];
    });
  }

  return parseMarkdownHeadings(await app.vault.read(file));
}

export async function insertContentAtFileTarget(app: App, file: TFile, target: FileSendTarget, contentToInsert: string): Promise<void> {
  const contentLines = trimOuterBlankLines(normalizeNewlines(contentToInsert).split("\n"));
  if (contentLines.length === 0) {
    return;
  }

  await app.vault.process(file, (source) => insertIntoFileSource(source, target, contentLines));
}

export function resolveFileInsertCursor(source: string, target: FileSendTarget): FileInsertCursor {
  const normalized = normalizeNewlines(source).replace(/\n*$/, "");
  const lines = normalized ? normalized.split("\n") : [];
  if (target.position === "file-start") {
    return { line: getSafeFileStartInsertIndex(normalized), ch: 0, fallbackToFileEnd: false };
  }
  if (target.position === "file-end" || !target.heading?.trim()) {
    return fileEndCursor(lines, false);
  }

  const headingIndex = lines.findIndex((line) => normalizeMarkdownHeadingText(line)?.heading === target.heading?.trim());
  if (headingIndex < 0) {
    return fileEndCursor(lines, true);
  }
  if (target.position === "heading-bottom") {
    const heading = normalizeMarkdownHeadingText(lines[headingIndex]);
    return { line: findHeadingEnd(lines, headingIndex, heading?.level ?? 6), ch: 0, fallbackToFileEnd: false };
  }

  return { line: headingTopInsertIndex(lines, headingIndex), ch: 0, fallbackToFileEnd: false };
}

export function collectMetadataTags(cache: CachedMetadata | null | undefined): string[] {
  if (!cache) {
    return [];
  }
  const tags = new Set<string>();
  collectFrontmatterTags(cache.frontmatter?.tags, tags);
  for (const tag of getAllTags(cache) ?? []) {
    addNormalizedTag(tags, tag);
  }
  return Array.from(tags);
}

export function normalizeFileTag(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/^#+/, "").replace(/\s+/g, "") : "";
}

export function normalizeSendToFileCommonTags(value: unknown): string[] {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\n,，]+/) : DEFAULT_SEND_TO_FILE_COMMON_TAGS;
  const seen = new Set<string>();
  const tags = source.flatMap((item) => {
    const normalized = normalizeFileTag(item);
    if (!normalized || seen.has(normalized)) {
      return [];
    }
    seen.add(normalized);
    return [normalized];
  });
  return tags.length > 0 ? tags : DEFAULT_SEND_TO_FILE_COMMON_TAGS;
}

export function normalizeFileInsertPosition(value: unknown): FileInsertPosition {
  if (value === "heading-bottom" || value === "file-end" || value === "file-start" || value === "new-heading") {
    return value;
  }
  return "heading-top";
}

export function normalizeNoHeadingBehavior(value: unknown): NoHeadingBehavior {
  if (value === "file-end" || value === "file-start") {
    return value;
  }
  return "ask";
}

export function updateRecentFileTargetPaths(current: string[], selectedPath: string, limit = 10): string[] {
  const normalizedSelected = normalizePath(selectedPath);
  return [normalizedSelected, ...current.map((path) => normalizePath(path)).filter((path) => path && path !== normalizedSelected)].slice(0, limit);
}

function fileInfoFromFile(file: TFile, tags: string[], matchTags: string[], cache?: CachedMetadata | null): TaggedFileInfo {
  return {
    file,
    name: file.basename,
    path: file.path,
    tags,
    matchTags,
    status: fileStatusFromCache(cache),
    updatedAt: file.stat?.mtime ?? 0
  };
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

function compareTagNames(left: string, right: string): number {
  return left.localeCompare(right, "zh-Hans-CN");
}

function parseMarkdownHeadings(source: string): FileHeadingInfo[] {
  return normalizeNewlines(source)
    .split("\n")
    .flatMap((line, index) => {
      const match = line.match(markdownHeadingExpression);
      if (!match) {
        return [];
      }
      return [
        {
          heading: match[2].trim(),
          level: match[1].length,
          line: index
        }
      ];
    });
}

function insertIntoFileSource(source: string, target: FileSendTarget, contentLines: string[]): string {
  const normalized = normalizeNewlines(source).replace(/\n*$/, "");
  const lines = normalized ? normalized.split("\n") : [];
  if (target.position === "new-heading") {
    return insertNewHeadingIntoFileSource(lines, target, contentLines);
  }
  if (target.position === "file-start") {
    const insertAt = getSafeFileStartInsertIndex(normalized);
    lines.splice(insertAt, 0, ...contentLines, ...(lines.length > insertAt ? [""] : []));
    return `${lines.join("\n")}\n`;
  }
  if (target.position === "file-end" || !target.heading?.trim()) {
    return lines.length > 0 ? `${lines.join("\n")}\n\n${contentLines.join("\n")}\n` : `${contentLines.join("\n")}\n`;
  }

  const headingIndex = lines.findIndex((line) => normalizeMarkdownHeadingText(line)?.heading === target.heading?.trim());
  if (headingIndex < 0) {
    if (target.createHeadingIfMissing) {
      return appendHeadingWithContent(lines, target.heading.trim(), contentLines);
    }
    return lines.length > 0 ? `${lines.join("\n")}\n\n${contentLines.join("\n")}\n` : `${contentLines.join("\n")}\n`;
  }

  if (target.position === "heading-bottom") {
    const heading = normalizeMarkdownHeadingText(lines[headingIndex]);
    const insertAt = findHeadingEnd(lines, headingIndex, heading?.level ?? 6);
    lines.splice(insertAt, 0, ...(insertAt > 0 && lines[insertAt - 1]?.trim() === "" ? [] : [""]), ...contentLines, "");
    return `${lines.join("\n")}\n`;
  }

  insertContentAtHeadingTop(lines, headingIndex, contentLines);
  return `${lines.join("\n")}\n`;
}

function insertContentAtHeadingTop(lines: string[], headingIndex: number, contentLines: string[]): void {
  let insertAt = headingIndex + 1;
  let hasBlankAfterHeading = false;
  while (insertAt < lines.length && lines[insertAt].trim() === "") {
    hasBlankAfterHeading = true;
    insertAt++;
  }
  lines.splice(insertAt, 0, ...(hasBlankAfterHeading ? [] : [""]), ...contentLines, "");
}

function headingTopInsertIndex(lines: string[], headingIndex: number): number {
  let insertAt = headingIndex + 1;
  while (insertAt < lines.length && lines[insertAt].trim() === "") {
    insertAt++;
  }
  return insertAt;
}

function insertNewHeadingIntoFileSource(lines: string[], target: FileSendTarget, contentLines: string[]): string {
  const headingName = target.newHeadingName?.trim() || target.heading?.trim() || "";
  if (!headingName) {
    return lines.length > 0 ? `${lines.join("\n")}\n\n${contentLines.join("\n")}\n` : `${contentLines.join("\n")}\n`;
  }

  const existingHeadingIndex = lines.findIndex((line) => normalizeMarkdownHeadingText(line)?.heading === headingName);
  const existingHeadingBehavior = target.existingHeadingBehavior ?? "use-existing";
  if (existingHeadingIndex >= 0 && existingHeadingBehavior === "cancel") {
    return `${lines.join("\n")}\n`;
  }
  if (existingHeadingIndex >= 0 && existingHeadingBehavior !== "create-duplicate") {
    insertContentAtHeadingTop(lines, existingHeadingIndex, contentLines);
    return `${lines.join("\n")}\n`;
  }

  const headingLevel = normalizeHeadingLevel(target.newHeadingLevel);
  const headingBlock = [`${"#".repeat(headingLevel)} ${headingName}`, "", ...contentLines];
  const insertAt = newHeadingInsertIndex(lines, target);
  insertBlockAt(lines, insertAt, headingBlock);
  return `${lines.join("\n")}\n`;
}

function newHeadingInsertIndex(lines: string[], target: FileSendTarget): number {
  if (target.newHeadingPosition === "file-start") {
    return getSafeFileStartInsertIndex(lines.join("\n"));
  }
  if (target.newHeadingPosition === "after-current-heading" && target.heading?.trim()) {
    const headingIndex = lines.findIndex((line) => normalizeMarkdownHeadingText(line)?.heading === target.heading?.trim());
    if (headingIndex >= 0) {
      const heading = normalizeMarkdownHeadingText(lines[headingIndex]);
      return findHeadingEnd(lines, headingIndex, heading?.level ?? 6);
    }
  }
  return lines.length;
}

function insertBlockAt(lines: string[], index: number, block: string[]): void {
  const prefix = index > 0 && lines[index - 1]?.trim() !== "" ? [""] : [];
  const suffix = index < lines.length && lines[index]?.trim() !== "" ? [""] : [];
  lines.splice(index, 0, ...prefix, ...block, ...suffix);
}

function normalizeHeadingLevel(value: unknown): MarkdownHeadingLevel {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN;
  if (parsed >= 1 && parsed <= 6) {
    return parsed as MarkdownHeadingLevel;
  }
  return 2;
}

export function getSafeFileStartInsertIndex(content: string): number {
  const lines = normalizeNewlines(content).split("\n");
  if (lines[0]?.trim() !== "---") {
    return 0;
  }
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index]?.trim() === "---") {
      let insertAt = index + 1;
      while (insertAt < lines.length && lines[insertAt]?.trim() === "") {
        insertAt += 1;
      }
      return insertAt;
    }
  }
  return 0;
}

function appendHeadingWithContent(lines: string[], heading: string, contentLines: string[]): string {
  const headingLines = [`## ${heading}`, "", ...contentLines];
  return lines.length > 0 ? `${lines.join("\n")}\n\n${headingLines.join("\n")}\n` : `${headingLines.join("\n")}\n`;
}

function findHeadingEnd(lines: string[], headingIndex: number, headingLevel: number): number {
  for (let index = headingIndex + 1; index < lines.length; index++) {
    const heading = normalizeMarkdownHeadingText(lines[index]);
    if (heading && heading.level <= headingLevel) {
      return index;
    }
  }
  return lines.length;
}

function fileEndCursor(lines: string[], fallbackToFileEnd: boolean): FileInsertCursor {
  if (lines.length === 0) {
    return { line: 0, ch: 0, fallbackToFileEnd };
  }
  const line = lines.length - 1;
  return { line, ch: lines[line].length, fallbackToFileEnd };
}

function normalizeMarkdownHeadingText(value: string): { heading: string; level: number } | null {
  const match = value.match(markdownHeadingExpression);
  return match ? { level: match[1].length, heading: match[2].trim() } : null;
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

const markdownHeadingExpression = /^(\s{0,3}#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/;
