import { normalizePath } from "obsidian";
import {
  normalizeFileInsertPosition,
  normalizeFileTag,
  type ExistingHeadingBehavior,
  type FileInsertPosition,
  type MarkdownHeadingLevel,
  type NewHeadingPosition
} from "./fileSend";
import { extractFirstUrl } from "./linkCapture";
import type { TaskContentMode } from "./tasksFormat";

export type ManagedTemplateType = "general" | "project" | "tag-file" | "medical" | "case" | "software" | "literature" | "custom";
export type TemplateFilenameRule = "title" | "title-date" | "date-title" | "datetime-title" | "custom";
export type TemplateTargetSource = "project-tag" | "specific-tag" | "recent-file" | "vault-search" | "fixed-file" | "new-file" | "default-memo";
export type TemplateInsertLocation = "file-start" | "file-end" | "heading" | "new-heading" | "ask";
export type TemplateInsertFormat = "note" | "task" | "callout" | "code" | "link" | "custom";
export type TemplateAfterTransferAction = "keep" | "archive" | "delete";
export type TemplateGlobalOverrideMode = "global" | "custom";
export type TemplateTaskMode = "none" | "always" | "ask" | "auto";
export type TemplateTaskDecision = "none" | "task" | "ask";

export interface ManagedTemplate {
  id: string;
  name: string;
  type: ManagedTemplateType;
  targetSource: TemplateTargetSource;
  recognitionTag: string;
  templateFilePath: string;
  fixedFilePath: string;
  folderPath: string;
  filenameRule: TemplateFilenameRule;
  customFilenameRule: string;
  defaultTags: string[];
  heading: string;
  insertLocation: TemplateInsertLocation;
  insertFormat: TemplateInsertFormat;
  insertPosition: FileInsertPosition;
  newHeadingName: string;
  newHeadingLevel: MarkdownHeadingLevel;
  newHeadingPosition: NewHeadingPosition;
  existingHeadingBehavior: ExistingHeadingBehavior;
  createHeadingIfMissing: boolean;
  clearAfterSendMode: TemplateGlobalOverrideMode;
  clearAfterSend: boolean;
  afterTransferActionMode: TemplateGlobalOverrideMode;
  afterTransferAction: TemplateAfterTransferAction;
  taskMode: TemplateTaskMode;
  taskAutoKeywords: string[];
  taskAutoTags: string[];
  taskAutoPrefixes: string[];
  taskAutoHeadings: string[];
  taskAutoUseInsertFormat: boolean;
  taskAutoUseTemplateName: boolean;
  taskAutoConfirm: boolean;
  taskContentMode: TaskContentMode;
  advancedContentTemplate: string;
}

export interface TemplateVariableContext {
  title: string;
  content?: string;
  tag?: string;
  source?: string;
  folder?: string;
  now?: Date;
}

export interface TemplateTaskDecisionContext {
  content: string;
  heading?: string;
}

export const TEMPLATE_FILENAME_RULES: TemplateFilenameRule[] = ["title", "title-date", "date-title", "datetime-title", "custom"];
export const MANAGED_TEMPLATE_TYPES: ManagedTemplateType[] = ["general", "project", "tag-file", "medical", "case", "software", "literature", "custom"];
export const TEMPLATE_TARGET_SOURCES: TemplateTargetSource[] = [
  "project-tag",
  "specific-tag",
  "recent-file",
  "vault-search",
  "fixed-file",
  "new-file",
  "default-memo"
];
export const TEMPLATE_INSERT_LOCATIONS: TemplateInsertLocation[] = ["file-start", "file-end", "heading", "new-heading", "ask"];
export const TEMPLATE_INSERT_FORMATS: TemplateInsertFormat[] = ["note", "task", "callout", "code", "link", "custom"];
export const TEMPLATE_AFTER_TRANSFER_ACTIONS: TemplateAfterTransferAction[] = ["keep", "archive", "delete"];
export const TEMPLATE_GLOBAL_OVERRIDE_MODES: TemplateGlobalOverrideMode[] = ["global", "custom"];
export const TEMPLATE_TASK_MODES: TemplateTaskMode[] = ["none", "always", "ask", "auto"];
export const TEMPLATE_TASK_CONTENT_MODES: TaskContentMode[] = ["task-with-detail", "task-only", "ask"];
export const DEFAULT_TEMPLATE_HEADING = "收集箱";

export interface DefaultProjectTemplateOptions {
  insertFormat?: TemplateInsertFormat;
  clearAfterSend?: boolean;
  afterTransferAction?: TemplateAfterTransferAction;
  createHeadingIfMissing?: boolean;
  advancedContentTemplate?: string;
}

export function createDefaultProjectTemplate(
  projectTag: string,
  folderPath: string,
  heading: string,
  options: DefaultProjectTemplateOptions = {}
): ManagedTemplate {
  const normalizedTag = normalizeFileTag(projectTag) || "项目";
  return {
    id: "default-project",
    name: "发送到项目",
    type: "project",
    targetSource: "project-tag",
    recognitionTag: normalizedTag,
    templateFilePath: "",
    fixedFilePath: "",
    folderPath: normalizePath(folderPath.trim() || "项目"),
    filenameRule: "title",
    customFilenameRule: "{{title}}",
    defaultTags: [normalizedTag],
    heading: heading.trim() || DEFAULT_TEMPLATE_HEADING,
    insertLocation: "heading",
    insertFormat: options.insertFormat ?? "note",
    insertPosition: "heading-top",
    newHeadingName: heading.trim() || DEFAULT_TEMPLATE_HEADING,
    newHeadingLevel: 2,
    newHeadingPosition: "file-end",
    existingHeadingBehavior: "use-existing",
    createHeadingIfMissing: options.createHeadingIfMissing ?? true,
    clearAfterSendMode: "global",
    clearAfterSend: options.clearAfterSend ?? true,
    afterTransferActionMode: "global",
    afterTransferAction: options.afterTransferAction ?? "keep",
    taskMode: "ask",
    taskAutoKeywords: [],
    taskAutoTags: [],
    taskAutoPrefixes: [],
    taskAutoHeadings: [],
    taskAutoUseInsertFormat: false,
    taskAutoUseTemplateName: false,
    taskAutoConfirm: false,
    taskContentMode: "task-with-detail",
    advancedContentTemplate: options.advancedContentTemplate ?? ""
  };
}

export function createEmptyManagedTemplate(): ManagedTemplate {
  return {
    id: createTemplateId(),
    name: "新模板",
    type: "general",
    targetSource: "new-file",
    recognitionTag: "",
    templateFilePath: "",
    fixedFilePath: "",
    folderPath: "我的资源/Memos",
    filenameRule: "title",
    customFilenameRule: "{{title}}",
    defaultTags: [],
    heading: DEFAULT_TEMPLATE_HEADING,
    insertLocation: "heading",
    insertFormat: "note",
    insertPosition: "heading-top",
    newHeadingName: DEFAULT_TEMPLATE_HEADING,
    newHeadingLevel: 2,
    newHeadingPosition: "file-end",
    existingHeadingBehavior: "use-existing",
    createHeadingIfMissing: true,
    clearAfterSendMode: "global",
    clearAfterSend: true,
    afterTransferActionMode: "global",
    afterTransferAction: "keep",
    taskMode: "none",
    taskAutoKeywords: [],
    taskAutoTags: [],
    taskAutoPrefixes: [],
    taskAutoHeadings: [],
    taskAutoUseInsertFormat: false,
    taskAutoUseTemplateName: false,
    taskAutoConfirm: false,
    taskContentMode: "task-with-detail",
    advancedContentTemplate: ""
  };
}

export function normalizeManagedTemplates(value: unknown): ManagedTemplate[] {
  const source = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  return source.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }
    const name = normalizeText(item.name, "");
    if (!name) {
      return [];
    }
    let id = normalizeText(item.id, "") || createTemplateId();
    while (seen.has(id)) {
      id = createTemplateId();
    }
    seen.add(id);
    const type = normalizeTemplateType(item.type);
    const defaultTags = normalizeTemplateTags(item.defaultTags);
    const targetSource = normalizeTemplateTargetSource(item.targetSource, type);
    const insertPosition = normalizeFileInsertPosition(item.insertPosition);
    const advancedContentTemplate = typeof item.advancedContentTemplate === "string" ? item.advancedContentTemplate : "";
    const insertFormat = normalizeTemplateInsertFormat(item.insertFormat, advancedContentTemplate);
    const folderPath = normalizePath(normalizeText(item.folderPath, "我的资源/Memos"));
    const clearAfterSendMode = normalizeTemplateGlobalOverrideMode(
      item.clearAfterSendMode,
      typeof item.clearAfterSend === "boolean" ? "custom" : "global"
    );
    const afterTransferActionMode = normalizeTemplateGlobalOverrideMode(
      item.afterTransferActionMode,
      typeof item.afterTransferAction === "string" ? "custom" : "global"
    );
    return [
      {
        id,
        name,
        type,
        targetSource,
        recognitionTag: normalizeTemplateRecognitionTag(item.recognitionTag, targetSource, defaultTags),
        templateFilePath: normalizeOptionalPath(item.templateFilePath),
        fixedFilePath: normalizeOptionalPath(item.fixedFilePath),
        folderPath,
        filenameRule: normalizeFilenameRule(item.filenameRule),
        customFilenameRule: normalizeText(item.customFilenameRule, "{{title}}"),
        defaultTags,
        heading: normalizeText(item.heading, DEFAULT_TEMPLATE_HEADING),
        insertLocation: normalizeTemplateInsertLocation(item.insertLocation, insertPosition),
        insertFormat,
        insertPosition,
        newHeadingName: normalizeText(item.newHeadingName, normalizeText(item.heading, DEFAULT_TEMPLATE_HEADING)),
        newHeadingLevel: normalizeMarkdownHeadingLevel(item.newHeadingLevel),
        newHeadingPosition: normalizeNewHeadingPosition(item.newHeadingPosition),
        existingHeadingBehavior: normalizeExistingHeadingBehavior(item.existingHeadingBehavior),
        createHeadingIfMissing: typeof item.createHeadingIfMissing === "boolean" ? item.createHeadingIfMissing : true,
        clearAfterSendMode,
        clearAfterSend: typeof item.clearAfterSend === "boolean" ? item.clearAfterSend : true,
        afterTransferActionMode,
        afterTransferAction: normalizeTemplateAfterTransferAction(item.afterTransferAction),
        taskMode: normalizeTemplateTaskMode(item.taskMode, type, targetSource, insertFormat),
        taskAutoKeywords: normalizeTemplateTextList(item.taskAutoKeywords),
        taskAutoTags: normalizeTemplateTags(item.taskAutoTags),
        taskAutoPrefixes: normalizeTemplateTextList(item.taskAutoPrefixes),
        taskAutoHeadings: normalizeTemplateTextList(item.taskAutoHeadings),
        taskAutoUseInsertFormat: typeof item.taskAutoUseInsertFormat === "boolean" ? item.taskAutoUseInsertFormat : false,
        taskAutoUseTemplateName: typeof item.taskAutoUseTemplateName === "boolean" ? item.taskAutoUseTemplateName : false,
        taskAutoConfirm: typeof item.taskAutoConfirm === "boolean" ? item.taskAutoConfirm : false,
        taskContentMode: normalizeTaskContentMode(item.taskContentMode),
        advancedContentTemplate
      }
    ];
  });
}

export function cloneManagedTemplate(template: ManagedTemplate): ManagedTemplate {
  return {
    ...template,
    id: createTemplateId(),
    name: `${template.name} 副本`,
    defaultTags: [...template.defaultTags],
    taskAutoKeywords: [...template.taskAutoKeywords],
    taskAutoTags: [...template.taskAutoTags],
    taskAutoPrefixes: [...template.taskAutoPrefixes],
    taskAutoHeadings: [...template.taskAutoHeadings]
  };
}

export function resolveTemplateClearAfterSend(template: ManagedTemplate | undefined, globalClearAfterSave: boolean): boolean {
  if (!template || template.clearAfterSendMode === "global") {
    return globalClearAfterSave;
  }
  return template.clearAfterSend;
}

export function resolveTemplateAfterTransferAction(
  template: ManagedTemplate | undefined,
  globalAfterTransferAction: TemplateAfterTransferAction
): TemplateAfterTransferAction {
  if (!template || template.afterTransferActionMode === "global") {
    return globalAfterTransferAction;
  }
  return template.afterTransferAction;
}

export function resolveTemplateTaskDecision(template: ManagedTemplate | undefined, context: TemplateTaskDecisionContext): TemplateTaskDecision {
  void context;
  if (!template) {
    return "none";
  }
  return template.insertFormat === "task" ? "task" : "none";
}

export function buildTemplateFilePath(template: ManagedTemplate, title: string, now = new Date()): string {
  const folder = normalizePath(template.folderPath || "我的资源/Memos");
  const filename = sanitizeFileName(renderFilenameRule(template, title, now)) || "未命名";
  return normalizePath(`${folder}/${filename}.md`);
}

export function buildTemplateFileContent(template: ManagedTemplate, context: TemplateVariableContext, templateSource = ""): string {
  const now = context.now ?? new Date();
  const title = context.title.trim() || "未命名";
  const folder = normalizePath(context.folder || template.folderPath);
  const activeTag = normalizeFileTag(context.tag);
  const tags = normalizeTemplateTags([...template.defaultTags, ...(activeTag ? [activeTag] : [])]);
  const variables = { ...context, title, folder, now };

  if (templateSource.trim()) {
    return ensureTrailingNewline(renderTemplateVariables(templateSource, variables));
  }
  if (template.advancedContentTemplate.trim()) {
    return ensureTrailingNewline(renderTemplateVariables(template.advancedContentTemplate, variables));
  }

  const frontmatter = ["---", "tags:", ...(tags.length > 0 ? tags.map((tag) => `  - ${tag}`) : ["  - "]), ...(template.type === "project" ? ["status: 进行中"] : []), "---"];
  const body = [`# ${title}`, ""];
  const heading = template.heading.trim();
  if (heading) {
    body.push(`## ${heading}`, "");
  }
  return ensureTrailingNewline([...frontmatter, "", ...body].join("\n"));
}

export function renderTemplateVariables(template: string, context: TemplateVariableContext): string {
  const now = context.now ?? new Date();
  const content = context.content ?? "";
  const source = context.source ?? extractFirstUrl(content) ?? "";
  const values: Record<string, string> = {
    title: context.title,
    date: formatDate(now),
    time: formatTime(now),
    datetime: `${formatDate(now)} ${formatTime(now)}`,
    content,
    tag: normalizeFileTag(context.tag) || "",
    source,
    folder: normalizePath(context.folder || "")
  };
  return template.replace(/{{\s*(title|date|time|datetime|content|tag|source|folder)\s*}}/g, (_, key: string) => values[key] ?? "");
}

export function createTemplateId(): string {
  return `template-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function renderFilenameRule(template: ManagedTemplate, title: string, now: Date): string {
  const safeTitle = title.trim() || "未命名";
  const date = formatDate(now);
  const time = formatTime(now).replace(":", "-");
  if (template.filenameRule === "title-date") {
    return `${safeTitle} ${date}`;
  }
  if (template.filenameRule === "date-title") {
    return `${date} ${safeTitle}`;
  }
  if (template.filenameRule === "datetime-title") {
    return `${date} ${time} ${safeTitle}`;
  }
  if (template.filenameRule === "custom") {
    return renderTemplateVariables(template.customFilenameRule || "{{title}}", { title: safeTitle, now });
  }
  return safeTitle;
}

function normalizeTemplateType(value: unknown): ManagedTemplateType {
  return typeof value === "string" && (MANAGED_TEMPLATE_TYPES as string[]).includes(value) ? (value as ManagedTemplateType) : "general";
}

function normalizeFilenameRule(value: unknown): TemplateFilenameRule {
  return typeof value === "string" && (TEMPLATE_FILENAME_RULES as string[]).includes(value) ? (value as TemplateFilenameRule) : "title";
}

function normalizeTemplateTargetSource(value: unknown, type: ManagedTemplateType): TemplateTargetSource {
  if (typeof value === "string" && (TEMPLATE_TARGET_SOURCES as string[]).includes(value)) {
    return value as TemplateTargetSource;
  }
  if (type === "project") {
    return "project-tag";
  }
  if (type === "tag-file") {
    return "specific-tag";
  }
  return "new-file";
}

function normalizeTemplateRecognitionTag(value: unknown, targetSource: TemplateTargetSource, defaultTags: string[]): string {
  const tag = normalizeFileTag(value);
  if (tag) {
    return tag;
  }
  if (targetSource === "project-tag") {
    return defaultTags[0] ?? "项目";
  }
  if (targetSource === "specific-tag") {
    return defaultTags[0] ?? "";
  }
  return "";
}

function normalizeTemplateInsertLocation(value: unknown, insertPosition: FileInsertPosition): TemplateInsertLocation {
  if (typeof value === "string" && (TEMPLATE_INSERT_LOCATIONS as string[]).includes(value)) {
    return value as TemplateInsertLocation;
  }
  if (insertPosition === "file-start") {
    return "file-start";
  }
  if (insertPosition === "file-end") {
    return "file-end";
  }
  if (insertPosition === "new-heading") {
    return "new-heading";
  }
  return "heading";
}

function normalizeMarkdownHeadingLevel(value: unknown): MarkdownHeadingLevel {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN;
  if (parsed >= 1 && parsed <= 6) {
    return parsed as MarkdownHeadingLevel;
  }
  return 2;
}

function normalizeNewHeadingPosition(value: unknown): NewHeadingPosition {
  return value === "file-start" || value === "after-current-heading" ? value : "file-end";
}

function normalizeExistingHeadingBehavior(value: unknown): ExistingHeadingBehavior {
  return value === "create-duplicate" || value === "cancel" ? value : "use-existing";
}

function normalizeTemplateInsertFormat(value: unknown, advancedContentTemplate: string): TemplateInsertFormat {
  const hasCustomTemplate = Boolean(advancedContentTemplate.trim());
  if (value === "note" && hasCustomTemplate) {
    return "custom";
  }
  if (typeof value === "string" && (TEMPLATE_INSERT_FORMATS as string[]).includes(value)) {
    return value as TemplateInsertFormat;
  }
  return hasCustomTemplate ? "custom" : "note";
}

function normalizeTemplateAfterTransferAction(value: unknown): TemplateAfterTransferAction {
  return typeof value === "string" && (TEMPLATE_AFTER_TRANSFER_ACTIONS as string[]).includes(value)
    ? (value as TemplateAfterTransferAction)
    : "keep";
}

function normalizeTemplateGlobalOverrideMode(value: unknown, fallback: TemplateGlobalOverrideMode): TemplateGlobalOverrideMode {
  return typeof value === "string" && (TEMPLATE_GLOBAL_OVERRIDE_MODES as string[]).includes(value) ? (value as TemplateGlobalOverrideMode) : fallback;
}

function normalizeTemplateTaskMode(
  value: unknown,
  type: ManagedTemplateType,
  targetSource: TemplateTargetSource,
  insertFormat: TemplateInsertFormat
): TemplateTaskMode {
  if (typeof value === "string" && (TEMPLATE_TASK_MODES as string[]).includes(value)) {
    return value as TemplateTaskMode;
  }
  if (insertFormat === "task") {
    return "always";
  }
  if (type === "project" && targetSource === "project-tag") {
    return "ask";
  }
  return "none";
}

function normalizeTaskContentMode(value: unknown): TaskContentMode {
  return value === "task-only" || value === "ask" ? value : "task-with-detail";
}

function normalizeTemplateTags(value: unknown): string[] {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\n,，]+/) : [];
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

function normalizeTemplateTextList(value: unknown): string[] {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\n,，]+/) : [];
  const seen = new Set<string>();
  return source.flatMap((item) => {
    const text = typeof item === "string" ? item.trim() : "";
    if (!text || seen.has(text)) {
      return [];
    }
    seen.add(text);
    return [text];
  });
}

function normalizeOptionalPath(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  return text && text !== "/" ? normalizePath(text) : "";
}

function normalizeText(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function sanitizeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
}

function ensureTrailingNewline(value: string): string {
  return value.replace(/\s*$/, "\n");
}

function formatDate(date: Date): string {
  return [String(date.getFullYear()), pad2(date.getMonth() + 1), pad2(date.getDate())].join("-");
}

function formatTime(date: Date): string {
  return [pad2(date.getHours()), pad2(date.getMinutes())].join(":");
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
