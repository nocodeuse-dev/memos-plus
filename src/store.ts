import { App, Notice, TFile, TFolder, normalizePath } from "obsidian";
import { formatDate, formatTime } from "./filter";
import {
  getFileHeadings,
  insertContentAtFileTarget,
  type FileHeadingInfo,
  type FileSendTarget,
  type TaggedFileInfo
} from "./fileSend";
import {
  buildFileTemplateTargetPath,
  finalizeFileTemplateContent,
  renderFileTemplateContent,
  type FileTemplateLibraryItem
} from "./fileTemplateLibrary";
import {
  ARCHIVE_TAG,
  MemoDocument,
  MemoItem,
  NewMemoInput,
  PIN_TAG,
  STAR_TAG,
  insertMemo,
  parseMemoDocument,
  removeMemo,
  replaceMemoContent,
  setMemoTag,
  toggleTaskAtLine
} from "./markdown";
import { DEFAULT_ATTACHMENT_FOLDER, DEFAULT_MEMO_FOLDER, type MemosPlusSettings } from "./settings";
import { t } from "./i18n";
import { applyDefaultPrefix } from "./prefix";
import { extractFirstUrl } from "./linkCapture";
import {
  buildProjectFileContent,
  insertContentUnderHeading,
  projectPathForName,
  type ProjectInfo,
  type ProjectInsertResult
} from "./projectSend";
import { renderTaskContentWithDetail } from "./taskContent";
import { findTemplaterPlugin, renderWithTemplater } from "./templaterAdapter";
import { normalizeTaskProjectTag, type ProjectTaskOptions } from "./tasksFormat";
import { buildTemplateFileContent, buildTemplateFilePath, renderTemplateVariables, type ManagedTemplate } from "./templateManager";
import { VaultMetadataIndex } from "./vaultIndex";
import { logMemosPlusDiagnostic } from "./diagnostics";
import { SerialTaskQueue } from "./serialTaskQueue";

export interface AddMemoOptions {
  preformatted?: boolean;
}

export interface ProjectSendOptions {
  preformatted?: boolean;
  template?: ManagedTemplate;
}

export class MemosPlusStore {
  private readonly fileCreationQueue = new SerialTaskQueue();

  constructor(
    private readonly app: App,
    private readonly getSettings: () => MemosPlusSettings,
    private readonly vaultIndex = new VaultMetadataIndex(app)
  ) {}

  async readDocument(): Promise<MemoDocument> {
    const files = this.getDocumentFiles();
    const documents = await Promise.all(files.map(async (file) => parseMemoDocument(await this.app.vault.read(file), file.path)));
    return {
      source: documents.map((document) => document.source).join("\n"),
      memos: documents.flatMap((document) => document.memos)
    };
  }

  async addMemo(content: string, now = new Date(), options: AddMemoOptions = {}): Promise<void> {
    const trimmed = content.trim();
    if (!trimmed) {
      new Notice(t(this.getSettings().language, "notice.empty"));
      return;
    }
    const input: NewMemoInput = {
      date: formatDate(now),
      time: formatTime(now),
      content: options.preformatted ? trimmed : applyDefaultPrefix(trimmed, this.getSettings().defaultPrefix)
    };
    const file = await this.ensureMemoFileForDate(input.date);
    await this.app.vault.process(file, (source) => insertMemo(source, input));
    new Notice(t(this.getSettings().language, "notice.saved"));
  }

  async addMemoToFile(path: string, content: string, now = new Date()): Promise<void> {
    const trimmed = content.trim();
    if (!trimmed) {
      new Notice(t(this.getSettings().language, "notice.empty"));
      return;
    }
    const input: NewMemoInput = {
      date: formatDate(now),
      time: formatTime(now),
      content: applyDefaultPrefix(trimmed, this.getSettings().defaultPrefix)
    };
    const file = await this.ensureMemoFileByPath(path);
    await this.app.vault.process(file, (source) => insertMemo(source, input));
    new Notice(t(this.getSettings().language, "notice.saved"));
  }

  async addListItemToFile(path: string, content: string): Promise<void> {
    const trimmed = content.trim();
    if (!trimmed) {
      new Notice(t(this.getSettings().language, "notice.empty"));
      return;
    }
    const file = await this.ensureMemoFileByPath(path);
    await this.app.vault.process(file, (source) => appendPlainListItem(source, trimmed));
    new Notice(t(this.getSettings().language, "notice.saved"));
  }

  async getProjectFiles(): Promise<TFile[]> {
    return this.vaultIndex.getProjectFiles(this.getSettings().projectTag);
  }

  async getProjects(): Promise<ProjectInfo[]> {
    const settings = this.getSettings();
    return this.vaultIndex.getProjectInfos(settings.projectTag, {
      recentProjectPaths: settings.recentProjectPaths,
      showArchivedProjects: settings.showArchivedProjects
    });
  }

  async getAllFileSendTags(): Promise<string[]> {
    return this.vaultIndex.getAllTagOptions();
  }

  async getTaggedFileTargets(tagQuery: string): Promise<TaggedFileInfo[]> {
    return this.vaultIndex.getTaggedFileInfos(tagQuery);
  }

  async searchFileTargets(query: string): Promise<TaggedFileInfo[]> {
    return this.vaultIndex.searchMarkdownFileInfos(query);
  }

  async getRecentFileTargets(): Promise<TaggedFileInfo[]> {
    return this.vaultIndex.getRecentFileInfos(this.getSettings().recentFileTargetPaths);
  }

  async getFileTargetHeadings(file: TFile): Promise<FileHeadingInfo[]> {
    const indexedHeadings = this.vaultIndex.getFileHeadings(file);
    if (indexedHeadings.length > 0) {
      return indexedHeadings;
    }
    return getFileHeadings(this.app, file);
  }

  async createProject(name: string): Promise<TFile> {
    return this.enqueueFileCreation(async () => {
      const settings = this.getSettings();
      const existingPaths = new Set(this.app.vault.getFiles().map((file) => file.path));
      const path = projectPathForName(settings.projectFolderPath, name, existingPaths);
      await this.ensureFolder(parentFolder(path));
      const basename = path.split("/").pop()?.replace(/\.md$/i, "") ?? name;
      return this.app.vault.create(path, buildProjectFileContent(basename, settings.projectTag, settings.projectSections));
    });
  }

  async createFileFromTemplate(template: ManagedTemplate, title: string, options: { tag?: string; content?: string } = {}): Promise<TFile> {
    return this.enqueueFileCreation(async () => {
      const now = new Date();
      const basePath = buildTemplateFilePath(template, title, now);
      const path = this.uniqueMarkdownPath(basePath);
      await this.ensureFolder(parentFolder(path));
      const templateSource = await this.readTemplateSource(template.templateFilePath);
      return this.app.vault.create(
        path,
        buildTemplateFileContent(
          template,
          {
            title: title.trim() || "未命名",
            content: options.content ?? "",
            tag: options.tag,
            folder: parentFolder(path),
            now
          },
          templateSource
        )
      );
    });
  }

  async getFileTemplateLibraryItems(): Promise<FileTemplateLibraryItem[]> {
    return this.vaultIndex.scanFileTemplateLibrary(this.getSettings());
  }

  async createFileFromLibraryTemplate(templatePath: string, title: string, options: { tag?: string; content?: string } = {}): Promise<TFile> {
    return this.enqueueFileCreation(() => this.createFileFromLibraryTemplateNow(templatePath, title, options));
  }

  private async createFileFromLibraryTemplateNow(
    templatePath: string,
    title: string,
    options: { tag?: string; content?: string } = {}
  ): Promise<TFile> {
    const settings = this.getSettings();
    const now = new Date();
    const basePath = buildFileTemplateTargetPath(settings.fileTemplateLibraryDefaultFolder, title);
    const path = this.uniqueMarkdownPath(basePath);
    const diagnosticDetail = { path, templatePath, templater: Boolean(findTemplaterPlugin(this.app)) };
    logMemosPlusDiagnostic("file-template:create-start", diagnosticDetail);
    try {
      await this.ensureFolder(parentFolder(path));
      const templateFile = this.getTemplateFile(templatePath);
      const templateSource = templateFile ? await this.app.vault.read(templateFile) : "";
      const context = {
        title: title.trim() || "未命名",
        content: options.content ?? "",
        tag: options.tag,
        folder: parentFolder(path),
        now
      };
      const fallbackContent = renderFileTemplateContent(templateSource, context);
      if (!findTemplaterPlugin(this.app)) {
        const file = await this.app.vault.create(path, fallbackContent);
        logMemosPlusDiagnostic("file-template:create-end", { ...diagnosticDetail, phase: "plain" });
        return file;
      }
      const file = await this.app.vault.create(path, "");
      logMemosPlusDiagnostic("file-template:templater-start", diagnosticDetail);
      const templaterContent = await renderWithTemplater(this.app, {
        templateFile,
        targetFile: file,
        templateSource: fallbackContent
      });
      logMemosPlusDiagnostic("file-template:templater-end", {
        ...diagnosticDetail,
        fallback: templaterContent === null
      });
      await this.app.vault.modify(file, templaterContent === null ? fallbackContent : finalizeFileTemplateContent(templaterContent, options.tag));
      logMemosPlusDiagnostic("file-template:create-end", { ...diagnosticDetail, phase: "templater" });
      return file;
    } catch (error) {
      logMemosPlusDiagnostic("file-template:create-error", { ...diagnosticDetail, error });
      throw error;
    }
  }

  async deleteFileTemplate(templatePath: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(normalizePath(templatePath));
    if (file instanceof TFile) {
      await this.app.fileManager.trashFile(file);
    }
  }

  async sendToProjectFile(
    file: TFile,
    content: string,
    section?: string,
    taskOptions?: ProjectTaskOptions,
    options: ProjectSendOptions = {}
  ): Promise<ProjectInsertResult> {
    const settings = this.getSettings();
    const heading = section?.trim() || settings.defaultProjectSection;
    const rendered = renderDeliveryContent(settings, file, content, taskOptions, options);
    return insertContentUnderHeading(this.app, file, heading, rendered, true);
  }

  async sendToFileTarget(
    file: TFile,
    content: string,
    target: FileSendTarget,
    taskOptions?: ProjectTaskOptions,
    options: ProjectSendOptions = {}
  ): Promise<void> {
    const settings = this.getSettings();
    const rendered = renderDeliveryContent(settings, file, content, taskOptions, options);
    const diagnosticDetail = { path: file.path, position: target.position, hasHeading: Boolean(target.heading?.trim()) };
    logMemosPlusDiagnostic("file-target:write-start", diagnosticDetail);
    try {
      await insertContentAtFileTarget(this.app, file, target, rendered);
      logMemosPlusDiagnostic("file-target:write-end", diagnosticDetail);
    } catch (error) {
      logMemosPlusDiagnostic("file-target:write-error", { ...diagnosticDetail, error });
      throw error;
    }
  }

  async updateMemo(memo: MemoItem, content: string): Promise<void> {
    await this.processMemo(memo, (source, current) => replaceMemoContent(source, current, content.trim()));
  }

  async deleteMemo(memo: MemoItem): Promise<void> {
    await this.processMemo(memo, (source, current) => removeMemo(source, current));
  }

  async togglePinned(memo: MemoItem): Promise<void> {
    await this.toggleStateTag(memo, PIN_TAG, !memo.isPinned);
  }

  async toggleStarred(memo: MemoItem): Promise<void> {
    await this.toggleStateTag(memo, STAR_TAG, !memo.isStarred);
  }

  async toggleArchived(memo: MemoItem): Promise<void> {
    await this.toggleStateTag(memo, ARCHIVE_TAG, !memo.isArchived);
  }

  async toggleTask(memo: MemoItem, contentLineIndex: number, checked: boolean): Promise<void> {
    await this.processMemo(memo, (source, current) => toggleTaskAtLine(source, current, contentLineIndex, checked));
  }

  async openMemoSource(memo: MemoItem): Promise<void> {
    const file = await this.ensureMemoFileByPath(memo.filePath);
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file, { state: { line: memo.range.start } });
  }

  async saveImageAttachment(buffer: ArrayBuffer, extension: string): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const path = buildImageAttachmentPath(this.getSettings().attachmentFolder || DEFAULT_ATTACHMENT_FOLDER, extension);
      if (this.app.vault.getAbstractFileByPath(path)) {
        continue;
      }
      await this.ensureFolder(parentFolder(path));
      await this.app.vault.createBinary(path, buffer);
      return path;
    }
    throw new Error("Could not create a unique image attachment path");
  }

  async createExcalidrawAttachment(now = new Date(), suffix?: string): Promise<TFile> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const path = buildExcalidrawAttachmentPath(
        this.getSettings().attachmentFolder || DEFAULT_ATTACHMENT_FOLDER,
        now,
        attempt === 0 && suffix ? suffix : randomSuffix()
      );
      if (this.app.vault.getAbstractFileByPath(path)) {
        continue;
      }
      await this.ensureFolder(parentFolder(path));
      return this.app.vault.create(path, buildEmptyExcalidrawFile());
    }
    throw new Error("Could not create a unique Excalidraw attachment path");
  }

  private async toggleStateTag(memo: MemoItem, tag: string, enabled: boolean): Promise<void> {
    await this.processMemo(memo, (source, current) => {
      return replaceMemoContent(source, current, setMemoTag(current.content, tag, enabled));
    });
  }

  private async processMemo(memo: MemoItem, updater: (source: string, current: MemoItem) => string): Promise<void> {
    const file = await this.ensureMemoFileByPath(memo.filePath);
    await this.app.vault.process(file, (source) => {
      const current = this.findCurrentMemo(source, file.path, memo);
      if (!current) {
        new Notice(t(this.getSettings().language, "notice.cannotFindMemo"));
        return source;
      }
      return updater(source, current);
    });
  }

  private findCurrentMemo(source: string, filePath: string, memo: MemoItem): MemoItem | null {
    const doc = parseMemoDocument(source, filePath);
    return (
      doc.memos.find((item) => item.range.start === memo.range.start && item.date === memo.date && item.time === memo.time) ??
      doc.memos.find((item) => item.date === memo.date && item.time === memo.time && item.content === memo.content) ??
      null
    );
  }

  private getYearFiles(): TFile[] {
    const folder = this.memoFolderPath();
    return this.app.vault
      .getFiles()
      .filter((file) => parentFolder(file.path) === folder && /^\d{4}\.md$/.test(file.name))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  private getDocumentFiles(): TFile[] {
    const files = this.getYearFiles();
    const seen = new Set<string>();
    return files.filter((file) => {
      const normalized = normalizePath(file.path);
      if (seen.has(normalized)) {
        return false;
      }
      seen.add(normalized);
      return true;
    });
  }

  private async ensureMemoFileForDate(date: string): Promise<TFile> {
    return this.ensureMemoFileByPath(this.memoFilePathForYear(date.slice(0, 4)));
  }

  private async ensureMemoFileByPath(path: string): Promise<TFile> {
    return this.enqueueFileCreation(async () => {
      const normalized = normalizePath(path);
      const existing = this.app.vault.getAbstractFileByPath(normalized);
      if (existing instanceof TFile) {
        return existing;
      }
      await this.ensureFolder(parentFolder(normalized));
      const createdByAnotherOperation = this.app.vault.getAbstractFileByPath(normalized);
      if (createdByAnotherOperation instanceof TFile) {
        return createdByAnotherOperation;
      }
      return this.app.vault.create(normalized, "");
    });
  }

  private async readTemplateSource(path: string): Promise<string> {
    const file = this.getTemplateFile(path);
    return file ? this.app.vault.read(file) : "";
  }

  private getTemplateFile(path: string): TFile | null {
    const normalized = normalizePath(path);
    if (!normalized) {
      return null;
    }
    const file = this.app.vault.getAbstractFileByPath(normalized);
    return file instanceof TFile ? file : null;
  }

  private uniqueMarkdownPath(path: string): string {
    const normalized = normalizePath(path);
    const existingPaths = new Set(this.app.vault.getFiles().map((file) => normalizePath(file.path)));
    if (!existingPaths.has(normalized)) {
      return normalized;
    }
    const withoutExtension = normalized.replace(/\.md$/i, "");
    for (let index = 2; index < 1000; index++) {
      const nextPath = `${withoutExtension} ${index}.md`;
      if (!existingPaths.has(normalizePath(nextPath))) {
        return normalizePath(nextPath);
      }
    }
    return normalizePath(`${withoutExtension}-${Date.now().toString(36)}.md`);
  }

  memoFilePathForYear(year: string): string {
    return normalizePath(`${this.memoFolderPath()}/${year}.md`);
  }

  private memoFolderPath(): string {
    return normalizePath(this.getSettings().memoFolderPath || DEFAULT_MEMO_FOLDER);
  }

  private async ensureFolder(folderPath: string): Promise<void> {
    if (!folderPath) {
      return;
    }
    const parts = normalizePath(folderPath).split("/").filter(Boolean);
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      const existing = this.app.vault.getAbstractFileByPath(current);
      if (existing instanceof TFolder) {
        continue;
      }
      try {
        await this.app.vault.createFolder(current);
      } catch (error) {
        if (!(this.app.vault.getAbstractFileByPath(current) instanceof TFolder)) {
          throw error;
        }
      }
    }
  }

  private async enqueueFileCreation<T>(operation: () => Promise<T>): Promise<T> {
    return this.fileCreationQueue.run(operation);
  }
}

function renderDeliveryContent(
  settings: MemosPlusSettings,
  file: TFile,
  content: string,
  taskOptions: ProjectTaskOptions | undefined,
  options: ProjectSendOptions
): string {
  const trimmed = content.trim();
  const now = new Date();
  if (options.preformatted) {
    return taskOptions?.isTask ? renderTaskWrappedDeliveryContent(settings, file, trimmed, taskOptions, trimmed, options, now) : trimmed;
  }
  const template = options.template;
  const resolvedTaskOptions = taskOptions ?? defaultTaskOptionsForTemplate(settings, template);
  if (resolvedTaskOptions?.isTask && isTaskWrapperCustomTemplate(template)) {
    const taskLine = renderTaskOnlyDeliveryContent(settings, file, trimmed, resolvedTaskOptions, options, now);
    return renderTaskWrapperCustomTemplate(template.advancedContentTemplate, file, trimmed, taskLine, template, now);
  }
  const formatted = renderFormattedDeliveryContent(file, trimmed, template, now);
  if (resolvedTaskOptions?.isTask) {
    const detailContent = template && template.insertFormat !== "note" && template.insertFormat !== "task" ? formatted : "";
    return renderTaskWrappedDeliveryContent(settings, file, trimmed, resolvedTaskOptions, detailContent, options, now);
  }
  return formatted;
}

function defaultTaskOptionsForTemplate(settings: MemosPlusSettings, template: ManagedTemplate | undefined): ProjectTaskOptions | undefined {
  if (template?.insertFormat !== "task") {
    return undefined;
  }
  return {
    isTask: true,
    priority: settings.taskDefaultPriority,
    scheduledDate: settings.taskDefaultScheduledDate,
    dueDate: settings.taskDefaultDueDate,
    recurrence: settings.taskDefaultRecurrence,
    addCreatedDate: settings.taskAddCreatedDate,
    contentMode: template.taskContentMode === "ask" ? "task-with-detail" : template.taskContentMode
  };
}

function renderFormattedDeliveryContent(file: TFile, content: string, template?: ManagedTemplate, now = new Date()): string {
  if (template?.insertFormat === "custom" && template.advancedContentTemplate.trim()) {
    return renderTemplateVariables(template.advancedContentTemplate, {
      title: file.basename,
      content,
      tag: template.recognitionTag || template.defaultTags?.[0] || "",
      folder: parentFolder(file.path),
      now
    }).trim();
  }
  if (template?.insertFormat === "task") {
    return `- [ ] ${stripTaskMarker(content)}`;
  }
  if (template?.insertFormat === "code") {
    return `\`\`\`text\n${content}\n\`\`\``;
  }
  return renderDefaultNoteDeliveryContent(file, content, now);
}

function renderDefaultNoteDeliveryContent(file: TFile, content: string, now = new Date()): string {
  const lines = [`- ${content}`, `  - 时间：${formatDate(now)} ${formatTime(now)}`];
  const source = extractFirstUrl(content);
  if (source) {
    lines.push(`  - 来源：${source}`);
  }
  lines.push(`  - 文件：${file.basename}`);
  return lines.join("\n");
}

function renderTaskWrappedDeliveryContent(
  settings: MemosPlusSettings,
  file: TFile,
  content: string,
  taskOptions: ProjectTaskOptions,
  detailContent: string,
  options: ProjectSendOptions,
  now = new Date()
): string {
  return renderTaskContentWithDetail(content, taskOptions, settings, {
    detailContent,
    contentMode: taskOptions.contentMode ?? options.template?.taskContentMode ?? "task-with-detail",
    projectTag: settings.taskAddProjectTag ? projectTaskTag(settings.projectTag, fileDisplayName(file)) : "",
    now
  });
}

function renderTaskOnlyDeliveryContent(
  settings: MemosPlusSettings,
  file: TFile,
  content: string,
  taskOptions: ProjectTaskOptions,
  options: ProjectSendOptions,
  now: Date
): string {
  return renderTaskContentWithDetail(content, { ...taskOptions, contentMode: "task-only" }, settings, {
    contentMode: "task-only",
    projectTag: settings.taskAddProjectTag ? projectTaskTag(settings.projectTag, fileDisplayName(file)) : "",
    now
  });
}

function isTaskWrapperCustomTemplate(template: ManagedTemplate | undefined): template is ManagedTemplate {
  return Boolean(template?.insertFormat === "custom" && /^\s*[-*+]\s+\[[ xX]\]/.test(template.advancedContentTemplate.trimStart()));
}

function renderTaskWrapperCustomTemplate(
  template: string,
  file: TFile,
  originalContent: string,
  taskLine: string,
  managedTemplate: ManagedTemplate,
  now: Date
): string {
  const values: Record<string, string> = {
    title: file.basename,
    date: formatDate(now),
    time: formatTime(now),
    datetime: `${formatDate(now)} ${formatTime(now)}`,
    content: taskLine,
    tag: managedTemplate.recognitionTag || managedTemplate.defaultTags?.[0] || "",
    source: extractFirstUrl(originalContent) ?? "",
    folder: parentFolder(file.path)
  };

  return template
    .replace(/{{\s*(title|date|time|datetime|content|tag|source|folder)\s*}}/g, (match, key: string, offset: number, source: string) => {
      if (key !== "content") {
        return values[key] ?? match;
      }
      return contentPlaceholderHasListMarker(source, offset) ? stripLeadingListMarker(taskLine) : taskLine;
    })
    .trim();
}

function contentPlaceholderHasListMarker(source: string, offset: number): boolean {
  const lineStart = source.lastIndexOf("\n", offset - 1) + 1;
  return /^\s*[-*+]\s*$/.test(source.slice(lineStart, offset));
}

function stripLeadingListMarker(content: string): string {
  return content.replace(/^\s*[-*+]\s+/, "").trimStart();
}

function stripTaskMarker(content: string): string {
  return content.replace(/^\s*[-*]\s+\[[ xX]\]\s*/, "").trim();
}

function parentFolder(path: string): string {
  const lastSlash = path.lastIndexOf("/");
  return lastSlash < 0 ? "" : path.slice(0, lastSlash);
}

function projectTaskTag(projectTag: string, projectName: string): string {
  return normalizeTaskProjectTag(`${projectTag}/${projectName}`);
}

function fileDisplayName(file: TFile): string {
  return file.basename || file.name.replace(/\.md$/i, "");
}

function appendPlainListItem(source: string, content: string): string {
  const normalized = source.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const body = normalized.replace(/\n*$/, "");
  const item = `- ${content}`;
  return body ? `${body}\n\n${item}\n` : `${item}\n`;
}

export function buildImageAttachmentPath(folder: string, extension: string, now = new Date(), suffix = randomSuffix()): string {
  const normalizedFolder = normalizePath(folder || DEFAULT_ATTACHMENT_FOLDER);
  const stamp = [
    String(now.getFullYear()),
    pad2(now.getMonth() + 1),
    pad2(now.getDate()),
    "-",
    pad2(now.getHours()),
    pad2(now.getMinutes()),
    pad2(now.getSeconds())
  ].join("");
  return normalizePath(`${normalizedFolder}/memos-plus-${stamp}-${suffix}.${normalizeImageExtension(extension)}`);
}

export function buildExcalidrawAttachmentPath(folder: string, now = new Date(), suffix = randomSuffix()): string {
  const normalizedFolder = normalizePath(folder || DEFAULT_ATTACHMENT_FOLDER);
  const stamp = [
    String(now.getFullYear()),
    pad2(now.getMonth() + 1),
    pad2(now.getDate()),
    "-",
    pad2(now.getHours()),
    pad2(now.getMinutes()),
    pad2(now.getSeconds())
  ].join("");
  return normalizePath(`${normalizedFolder}/memos-plus-${stamp}-${suffix}.excalidraw.md`);
}

export function buildEmptyExcalidrawFile(): string {
  return [
    "---",
    "",
    "excalidraw-plugin: parsed",
    "tags: [excalidraw]",
    "",
    "---",
    "==⚠  Switch to EXCALIDRAW VIEW in the MORE OPTIONS menu of this document. ⚠== You can decompress Drawing data with the command palette: 'Decompress current Excalidraw file'. For more info check in plugin settings under 'Saving'",
    "",
    "",
    "## Drawing",
    "```compressed-json",
    EMPTY_EXCALIDRAW_COMPRESSED_JSON,
    "```",
    "%%",
    ""
  ].join("\n");
}

const EMPTY_EXCALIDRAW_COMPRESSED_JSON =
  "N4IgLgngDgpiBcIYA8DGBDANgSwCYCd0B3EAGhADcZ8BnbAewDsEAmcm+gV31TkQAswYKDXgB6MQHNsYfpwBGAOlT0AtmIBeNCtlQbs6RmPry6uA4wC0KDDgLFLUTJ2lH8MTDHQ0YNMWHRJFkUWAGZFAEYWMiRPVRhGMBoEAG0AXXJ0KCgAZQCwPlBJfDwc7A0+Rk5MTHIdGCIAIXRUAGtirkZcAGF6THp8BBAAYgAzcYmQAF8poA===";

export function normalizeImageExtension(extension: string): string {
  const normalized = extension.replace(/^\./, "").trim().toLowerCase();
  if (!/^[a-z0-9]{1,8}$/.test(normalized)) {
    return "png";
  }
  return normalized;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 6) || "memo";
}
