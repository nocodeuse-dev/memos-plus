import type { App, TFile } from "obsidian";
import { vaultSearchNeedsContent } from "./performance";
import { isValidCondition, type SavedSearch, type SavedSearchCondition, type SavedSearchEvalContext } from "./savedSearch";
import { findMatchingTasks, isTaskSearchField, parseTaskLines, type ParsedTaskLine } from "./taskSearch";
import { VaultMetadataIndex, type VaultIndexFile } from "./vaultIndex";

export interface VaultSearchResult {
  file: TFile;
  title: string;
  path: string;
  tags: string[];
  modifiedTime: number;
  excerpt: string;
  task?: ParsedTaskLine;
}

export interface VaultSearchOptions {
  maxResults?: number;
  maxContentReads?: number;
  signal?: AbortSignal;
}

export interface VaultSearchCacheOptions {
  maxCachedCharacters?: number;
}

const DEFAULT_MAX_CACHED_CHARACTERS = 2_000_000;

interface CachedFileContent {
  mtime: number;
  text: string;
}

interface VaultSearchDocument {
  file: TFile;
  title: string;
  path: string;
  tags: string[];
  modifiedDate: string;
  modifiedYear: string;
  frontmatterText: string;
  content: string;
  excerpt: string;
  hasImage: boolean;
  hasLink: boolean;
  hasTask: boolean;
  tasks: ParsedTaskLine[];
}

export class VaultSavedSearchIndex {
  private readonly contentCache = new Map<string, CachedFileContent>();
  private cachedCharacters = 0;
  private readonly maxCachedCharacters: number;

  constructor(
    private readonly app: App,
    private readonly metadataIndex = new VaultMetadataIndex(app),
    options: VaultSearchCacheOptions = {}
  ) {
    this.maxCachedCharacters = normalizeCacheCharacterLimit(options.maxCachedCharacters);
  }

  clearContentCache(path?: string): void {
    if (!path) {
      this.contentCache.clear();
      this.cachedCharacters = 0;
      return;
    }
    this.deleteCachedContent(path);
  }

  async search(search: SavedSearch, context: SavedSearchEvalContext = {}, options: VaultSearchOptions = {}): Promise<VaultSearchResult[]> {
    const conditions = search.conditions.filter(isValidCondition);
    if (conditions.length === 0) {
      return [];
    }
    const needsContent = conditions.some(conditionNeedsContent);
    const maxResults = normalizePositiveLimit(options.maxResults);
    const maxContentReads = normalizePositiveLimit(options.maxContentReads);
    if (maxResults === 0 || maxContentReads === 0) {
      return [];
    }
    const results: VaultSearchResult[] = [];
    const metadataConditions = conditions.filter((condition) => !conditionNeedsContent(condition));
    const canPrefilterByMetadata = search.match === "all" && needsContent && metadataConditions.length > 0;
    let contentReads = 0;
    for (const entry of orderEntriesForSearch(this.metadataIndex.getEntries(), Boolean(maxResults || maxContentReads))) {
      if (options.signal?.aborted) {
        break;
      }
      if (canPrefilterByMetadata) {
        const metadataDocument = await this.buildDocument(entry, false);
        if (!metadataConditions.every((condition) => matchesVaultCondition(metadataDocument, condition, context))) {
          continue;
        }
      }
      if (needsContent) {
        if (maxContentReads !== undefined && contentReads >= maxContentReads) {
          break;
        }
        contentReads += 1;
      }
      const document = await this.buildDocument(entry, needsContent);
      results.push(...resultsForDocument(document, conditions, search.match, context));
      if (maxResults !== undefined && results.length >= maxResults) {
        break;
      }
    }
    const sorted = results.sort((left, right) => right.modifiedTime - left.modifiedTime || left.path.localeCompare(right.path, "zh-Hans"));
    return maxResults === undefined ? sorted : sorted.slice(0, maxResults);
  }

  private async buildDocument(entry: VaultIndexFile, needsContent: boolean): Promise<VaultSearchDocument> {
    const frontmatterText = stringifyFrontmatter(entry.frontmatter);
    const content = needsContent ? await this.readFile(entry.file) : "";
    const tasks = content ? parseTaskLines(content) : [];
    return {
      file: entry.file,
      title: entry.basename,
      path: entry.path,
      tags: entry.tags,
      modifiedDate: formatDate(new Date(entry.mtime)),
      modifiedYear: String(new Date(entry.mtime).getFullYear()),
      frontmatterText,
      content,
      excerpt: excerptForFile(content, frontmatterText),
      hasImage: entry.hasImage || fileContentHasImage(content),
      hasLink: entry.hasLink || fileContentHasLink(content),
      hasTask: tasks.length > 0,
      tasks
    };
  }

  private async readFile(file: TFile): Promise<string> {
    const mtime = file.stat?.mtime ?? 0;
    const cached = this.contentCache.get(file.path);
    if (cached && cached.mtime === mtime) {
      this.contentCache.delete(file.path);
      this.contentCache.set(file.path, cached);
      return cached.text;
    }
    if (cached) {
      this.deleteCachedContent(file.path);
    }
    const text = await this.app.vault.read(file);
    this.cacheContent(file.path, { mtime, text });
    return text;
  }

  private cacheContent(path: string, content: CachedFileContent): void {
    if (this.maxCachedCharacters === 0 || content.text.length > this.maxCachedCharacters) {
      return;
    }
    this.deleteCachedContent(path);
    this.contentCache.set(path, content);
    this.cachedCharacters += content.text.length;
    while (this.cachedCharacters > this.maxCachedCharacters && this.contentCache.size > 0) {
      const oldestPath = this.contentCache.keys().next().value as string | undefined;
      if (!oldestPath) {
        break;
      }
      this.deleteCachedContent(oldestPath);
    }
  }

  private deleteCachedContent(path: string): void {
    const cached = this.contentCache.get(path);
    if (!cached) {
      return;
    }
    this.cachedCharacters = Math.max(0, this.cachedCharacters - cached.text.length);
    this.contentCache.delete(path);
  }
}

function resultsForDocument(
  document: VaultSearchDocument,
  conditions: SavedSearchCondition[],
  match: SavedSearch["match"],
  context: SavedSearchEvalContext
): VaultSearchResult[] {
  const taskConditions = conditions.filter((condition) => isTaskSearchField(condition.field));
  const otherConditions = conditions.filter((condition) => !isTaskSearchField(condition.field));
  if (match === "any") {
    const matchingTasks = uniqueTasks(taskConditions.flatMap((condition) => findMatchingTasks(document.tasks, [condition], context)));
    if (matchingTasks.length > 0) {
      return matchingTasks.map((task) => resultForDocument(document, task));
    }
    return otherConditions.some((condition) => matchesVaultCondition(document, condition, context)) ? [resultForDocument(document)] : [];
  }

  if (!otherConditions.every((condition) => matchesVaultCondition(document, condition, context))) {
    return [];
  }
  if (taskConditions.length === 0) {
    return [resultForDocument(document)];
  }
  return findMatchingTasks(document.tasks, taskConditions, context).map((task) => resultForDocument(document, task));
}

function resultForDocument(document: VaultSearchDocument, task?: ParsedTaskLine): VaultSearchResult {
  return {
    file: document.file,
    title: document.title,
    path: document.path,
    tags: document.tags,
    modifiedTime: document.file.stat?.mtime ?? 0,
    excerpt: task?.text ?? document.excerpt,
    task
  };
}

function uniqueTasks(tasks: ParsedTaskLine[]): ParsedTaskLine[] {
  const seen = new Set<string>();
  return tasks.filter((task) => {
    const key = `${task.line}\n${task.text}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function matchesVaultCondition(document: VaultSearchDocument, condition: SavedSearchCondition, context: SavedSearchEvalContext): boolean {
  switch (condition.field) {
    case "tag":
      return matchStringList(document.tags, condition);
    case "text":
      return matchString([document.title, document.path, document.frontmatterText, document.content].join("\n"), condition);
    case "date":
      return matchDate(document.modifiedDate, condition, context);
    case "status":
      return matchStringList(statusValues(document), condition);
    case "image":
      return matchBoolean(document.hasImage, condition.operator);
    case "link":
      return matchBoolean(document.hasLink, condition.operator);
    case "task":
      return matchBoolean(document.hasTask, condition.operator);
    case "taskStatus":
    case "taskPriority":
    case "taskDueDate":
    case "taskScheduledDate":
    case "taskStartDate":
    case "taskCreatedDate":
    case "taskDoneDate":
    case "taskRecurring":
    case "taskOverdue":
    case "taskDueToday":
    case "taskFuture":
      return findMatchingTasks(document.tasks, [condition], context).length > 0;
    case "year":
      return matchString(document.modifiedYear, condition);
    case "path":
      return matchString(document.path, condition);
  }
}

function conditionNeedsContent(condition: SavedSearchCondition): boolean {
  return vaultSearchNeedsContent(condition);
}

function normalizePositiveLimit(value: number | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isFinite(value)) {
    return undefined;
  }
  return Math.max(0, Math.floor(value));
}

function normalizeCacheCharacterLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return DEFAULT_MAX_CACHED_CHARACTERS;
  }
  return Math.max(0, Math.floor(value));
}

function orderEntriesForSearch(entries: VaultIndexFile[], limited: boolean): VaultIndexFile[] {
  if (!limited) {
    return entries;
  }
  return [...entries].sort((left, right) => right.mtime - left.mtime || left.path.localeCompare(right.path, "zh-Hans"));
}

function statusValues(document: VaultSearchDocument): string[] {
  const values: string[] = [];
  const frontmatter = document.frontmatterText.toLowerCase();
  for (const value of ["pinned", "starred", "archived", "进行中", "暂停", "完成", "归档"]) {
    if (frontmatter.includes(value.toLowerCase())) {
      values.push(value);
    }
  }
  for (const tag of document.tags) {
    const last = tag.split("/").pop();
    if (last) {
      values.push(last);
    }
  }
  return values;
}

function stringifyFrontmatter(frontmatter: Record<string, unknown> | undefined): string {
  if (!frontmatter) {
    return "";
  }
  return Object.entries(frontmatter)
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(" ") : String(value ?? "")}`)
    .join("\n");
}

function fileContentHasImage(content: string): boolean {
  return /!\[[^\]]*]\([^)]+\)|!\[\[[^\]]+]]|\.(png|jpe?g|gif|webp|svg|avif)\b/i.test(content);
}

function fileContentHasLink(content: string): boolean {
  return /https?:\/\/|[[\]][^\]]+]|]\([^)]+\)/i.test(content);
}

function excerptForFile(content: string, frontmatterText: string): string {
  return (
    content
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith("---") && !/^#{1,6}\s+/.test(line)) ??
    frontmatterText
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean) ??
    ""
  );
}

function matchStringList(values: string[], condition: SavedSearchCondition): boolean {
  if (condition.operator === "exists") {
    return values.length > 0;
  }
  if (condition.operator === "notExists") {
    return values.length === 0;
  }
  const target = normalizeComparable(condition.value);
  if (!target) {
    return false;
  }
  if (condition.operator === "contains") {
    return values.some((value) => normalizeComparable(value).includes(target));
  }
  if (condition.operator === "notContains") {
    return values.every((value) => !normalizeComparable(value).includes(target));
  }
  if (condition.operator === "equals") {
    return values.some((value) => normalizeComparable(value) === target);
  }
  if (condition.operator === "notEquals") {
    return values.every((value) => normalizeComparable(value) !== target);
  }
  return false;
}

function matchString(value: string, condition: SavedSearchCondition): boolean {
  const source = normalizeComparable(value);
  const target = normalizeComparable(condition.value);
  if (!target) {
    return false;
  }
  if (condition.operator === "contains") {
    return source.includes(target);
  }
  if (condition.operator === "notContains") {
    return !source.includes(target);
  }
  if (condition.operator === "equals") {
    return source === target;
  }
  if (condition.operator === "notEquals") {
    return source !== target;
  }
  return false;
}

function matchDate(value: string, condition: SavedSearchCondition, context: SavedSearchEvalContext): boolean {
  const target = resolveDateToken(condition.value ?? "", context);
  if (!target) {
    return false;
  }
  if (condition.operator === "equals") {
    return value === target;
  }
  if (condition.operator === "notEquals") {
    return value !== target;
  }
  if (condition.operator === "before") {
    return value < target;
  }
  if (condition.operator === "after") {
    return value > target;
  }
  if (condition.operator === "between") {
    const end = resolveDateToken(condition.valueTo ?? "", context);
    return Boolean(end) && value >= target && value <= end;
  }
  return false;
}

function matchBoolean(value: boolean, operator: SavedSearchCondition["operator"]): boolean {
  if (operator === "exists") {
    return value;
  }
  if (operator === "notExists") {
    return !value;
  }
  return false;
}

function resolveDateToken(value: string, context: SavedSearchEvalContext): string {
  const today = context.today ?? formatDate(new Date());
  if (value === "$today") {
    return today;
  }
  if (value === "$weekStart") {
    return startOfWeek(today);
  }
  if (value === "$weekEnd") {
    return addDays(startOfWeek(today), 6);
  }
  return value;
}

function normalizeComparable(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function startOfWeek(dateString: string): string {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const diff = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - diff);
  return formatDate(date);
}

function addDays(dateString: string, days: number): string {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return formatDate(date);
}

function formatDate(date: Date): string {
  return [date.getFullYear(), pad2(date.getMonth() + 1), pad2(date.getDate())].join("-");
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
