import { Notice, Platform, type App } from "obsidian";
import { prepareCalloutContent } from "./callout";
import { createComposerActions, type ComposerActions, type ComposerActionsOptions, type ComposerProjectMode } from "./composerActions";
import type { ProjectSendChoice, ProjectSendModalOptions } from "./projectFileSuggestModal";
import {
  ComposerWidget,
  type ComposerInputClearSource,
  type ComposerInputChangeSource,
  type ComposerSurface
} from "./composerWidget";
import type { DisplayModuleId } from "./displayModules";
import { shouldMemosHandleImagePaste } from "./imageHandling";
import { t } from "./i18n";
import { runExcalidrawCreateAfterTargetSelection } from "./excalidrawEmbed";
import {
  type QuickCaptureContentSource,
  getQuickCaptureInitialContent,
  openQuickCaptureContentPrompt,
  readClipboardImageSafely,
  readClipboardTextSafely,
  readCurrentEditorSelection,
  type QuickCaptureInitialContentMode,
  type QuickCaptureInitialContentResult
} from "./quickCaptureContent";
import {
  AUTO_CLIPBOARD_SOURCE,
  type ClipboardAutoFillContext,
  type ClipboardAutoFillState,
  markClipboardAutoApplied,
  markClipboardDismissed,
  wasClipboardContentAutoApplied
} from "./clipboardAutoFill";
import type { DefaultSendAction, MemosPlusSettings } from "./settings";
import type { MemosPlusStore } from "./store";
import { openTaskOptionsModal, renderTaskContentWithOptions } from "./taskOptionsModal";

export interface ComposerSessionHost {
  app: App;
  parent: Element;
  settings: MemosPlusSettings;
  store: MemosPlusStore;
  persistSettings: () => Promise<void>;
  refreshViews: () => Promise<void>;
  registerCleanup?: (cleanup: () => void) => void;
  resolveMarkdownLink?: (text: string) => Promise<string | null>;
  selectProjectTargetOnMobile?: (options: ProjectSendModalOptions) => Promise<ProjectSendChoice | null>;
}

export interface ComposerSessionOptions extends ComposerActionsOptions {
  surface?: ComposerSurface;
  defaultSendAction?: () => DefaultSendAction;
  initialContent?: string;
  initialContentMode?: QuickCaptureInitialContentMode;
  clipboardAutoFillContext?: ClipboardAutoFillContext;
  clipboardAutoFillState?: ClipboardAutoFillState;
  clipboardThrottleMs?: number;
  showClipboardEmptyNotice?: boolean;
  onIncomingContentApplied?: () => void | Promise<void>;
  onClearDraft?: () => void | Promise<void>;
  displayModules?: ReadonlySet<DisplayModuleId>;
}

export interface ComposerSession {
  widget: ComposerWidget;
  actions: ComposerActions;
  applyInitialContent: (mode?: QuickCaptureInitialContentMode, showClipboardEmptyNotice?: boolean) => Promise<void>;
  focus: () => void;
  destroy: () => void;
}

export function resolveComposerInitialContent(settings: MemosPlusSettings, initialContent: string | undefined): string | undefined {
  if (initialContent !== undefined) {
    return initialContent;
  }
  if (!settings.sendFailureDraftEnabled) {
    return undefined;
  }
  const draft = settings.sendFailureDraftContent.trim();
  return draft ? settings.sendFailureDraftContent : undefined;
}

export function createComposerSession(host: ComposerSessionHost, options: ComposerSessionOptions = {}): ComposerSession {
  let actions: ComposerActions | null = null;
  const widget = new ComposerWidget({
    app: host.app,
    parent: host.parent,
    settings: () => host.settings,
    sourcePath: host.store.memoFilePathForYear(String(new Date().getFullYear())),
    onSend: () => actions?.handleSend(),
    formatTaskContent: (content, context) => openComposerTaskOptions(host, content, context),
    saveImageAttachment: (buffer, extension) => host.store.saveImageAttachment(buffer, extension),
    createExcalidrawAttachment: () => runExcalidrawCreateAfterTargetSelection(host),
    registerCleanup: host.registerCleanup,
    sendActionTitle: options.defaultSendAction,
    resolveMarkdownLink: host.resolveMarkdownLink,
    onClearDraft: () => clearComposerDraftCaches(host, options),
    onComposerInputCleared: (content, source) => clearClipboardAutoFillFromUser(content, source, options, host),
    surface: options.surface ?? "home",
    displayModules: options.displayModules
  });

  const initialContent = resolveComposerInitialContent(host.settings, options.initialContent);
  if (initialContent !== undefined) {
    widget.setValue(initialContent);
  }

  actions = createComposerActions(
    {
      app: host.app,
      store: host.store,
      settings: host.settings,
      persistSettings: host.persistSettings,
      refreshViews: host.refreshViews,
      selectProjectTargetOnMobile: host.selectProjectTargetOnMobile
    },
    () => widget,
    {
      defaultSendAction: options.defaultSendAction,
      afterDefaultSave: options.afterDefaultSave,
      afterProjectSend: options.afterProjectSend
    }
  );

  const notice = (key: string): void => {
    new Notice(t(host.settings.language, key));
  };

  const applyIncomingContent = async (result: QuickCaptureInitialContentResult): Promise<void> => {
    if (result.imageFile) {
      await widget.insertImageFile(result.imageFile);
      markAutoFillIfNeeded(result.source, result.autoFillFingerprintContent ?? result.content);
      await options.onIncomingContentApplied?.();
      return;
    }
    if (result.action === "skip") {
      return;
    }
    await widget.processInputContentChange(inputChangeSourceForIncomingContent(result), result.content, {
      action: result.action,
      focus: !Platform.isMobile,
      analyzeLinks: result.source !== "selection"
    });
    markAutoFillIfNeeded(result.source, result.content);
    await options.onIncomingContentApplied?.();
  };

  const markAutoFillIfNeeded = (source: QuickCaptureContentSource, content: string): void => {
    if (!shouldMarkAutoFillContent(source, content, options)) {
      return;
    }
    const state = options.clipboardAutoFillState;
    if (!state) {
      return;
    }
    const marked = markClipboardAutoApplied(content, {
      context: options.clipboardAutoFillContext ?? "main",
      source: AUTO_CLIPBOARD_SOURCE,
      state,
      now: Date.now()
    });
    if (!marked) {
      return;
    }
    void host.persistSettings().catch((error) => {
      console.warn("[Memos Plus] Failed to persist clipboard auto-fill state", error);
    });
  };

  const applyInitialContent = async (
    mode: QuickCaptureInitialContentMode = options.initialContentMode ?? "auto",
    showClipboardEmptyNotice = options.showClipboardEmptyNotice ?? false
  ): Promise<void> => {
    if (mode === "none") {
      return;
    }
    const result = await getQuickCaptureInitialContent({
      settings: host.settings,
      existingContent: widget.getValue(),
      mode,
      readSelection: () => readCurrentEditorSelection(host.app),
      readClipboardText: () => readClipboardTextSafely(() => notice("quickCaptureContent.clipboardUnsupported")),
      readClipboardImage: shouldMemosHandleImagePaste(host.settings.imageHandlingMode, host.app)
        ? () => readClipboardImageSafely(() => notice("quickCaptureContent.clipboardUnsupported"))
        : undefined,
      chooseAction: (request) => openQuickCaptureContentPrompt(host.app, host.settings.language, request),
      clipboardAutoFillState: options.clipboardAutoFillState,
      clipboardAutoFillContext: options.clipboardAutoFillContext,
      clipboardThrottleMs: options.clipboardThrottleMs
    });
    if (!result) {
      if (showClipboardEmptyNotice && mode === "clipboard") {
        notice("quickCaptureContent.clipboardEmpty");
      }
      return;
    }
    await applyIncomingContent(result);
  };

  return {
    widget,
    actions,
    applyInitialContent,
    focus: () => widget.focus(),
    destroy: () => widget.destroy()
  };
}

function shouldMarkAutoFillContent(
  source: QuickCaptureContentSource,
  content: string,
  options: ComposerSessionOptions
): boolean {
  if (source !== "clipboard-text" && source !== "clipboard-link" && source !== "clipboard-image") {
    return false;
  }
  if (!content.trim()) {
    return false;
  }
  return Boolean(options.clipboardAutoFillContext && options.clipboardAutoFillState);
}

async function clearClipboardAutoFillFromUser(
  content: string,
  source: ComposerInputClearSource,
  options: ComposerSessionOptions,
  host: ComposerSessionHost
): Promise<void> {
  if (source !== "manual") {
    return;
  }
  if (!options.clipboardAutoFillContext || !options.clipboardAutoFillState || !wasClipboardContentAutoApplied(content, options.clipboardAutoFillState)) {
    return;
  }
  const shouldDismiss = markClipboardDismissed(content, {
    context: options.clipboardAutoFillContext,
    source: AUTO_CLIPBOARD_SOURCE,
    state: options.clipboardAutoFillState,
    now: Date.now()
  });
  if (!shouldDismiss) {
    return;
  }
  try {
    await host.persistSettings();
  } catch (error) {
    console.warn("[Memos Plus] Failed to persist clipboard auto-fill dismissal state", error);
  }
}

export type { ComposerProjectMode };

async function clearComposerDraftCaches(host: ComposerSessionHost, options: ComposerSessionOptions): Promise<void> {
  let shouldPersist = false;
  if (host.settings.sendFailureDraftContent) {
    host.settings.sendFailureDraftContent = "";
    shouldPersist = true;
  }
  try {
    await options.onClearDraft?.();
  } finally {
    if (shouldPersist) {
      await host.persistSettings();
    }
  }
}

function inputChangeSourceForIncomingContent(result: QuickCaptureInitialContentResult): ComposerInputChangeSource {
  if (result.source === "selection") {
    return result.action === "append" ? "selection-append" : "selection-fill";
  }
  return result.action === "append" ? "clipboard-append" : "clipboard-fill";
}

async function openComposerTaskOptions(host: ComposerSessionHost, content: string, context: { manualCalloutMode: boolean }): Promise<string | null> {
  const task = await openTaskOptionsModal(host.app, {
    language: host.settings.language,
    title: t(host.settings.language, "projectSend.taskOptions"),
    description: content.trim(),
    taskSettings: {
      enabled: host.settings.tasksFormatEnabled,
      defaultPriority: host.settings.taskDefaultPriority,
      defaultDueDate: host.settings.taskDefaultDueDate,
      defaultScheduledDate: host.settings.taskDefaultScheduledDate,
      defaultRecurrence: host.settings.taskDefaultRecurrence,
      addCreatedDate: host.settings.taskAddCreatedDate
    },
    defaultAsTask: true,
    allowPlain: false
  });
  if (task === null) {
    return null;
  }
  const prepared = prepareCalloutContent(content, host.settings, context.manualCalloutMode, { now: new Date() });
  const detailAlreadyFormatted = context.manualCalloutMode || content.trim().startsWith("> [!") || content.trim().startsWith("```");
  return renderTaskContentWithOptions(
    prepared.content,
    {
      ...(task ?? { isTask: true }),
      contentMode: detailAlreadyFormatted || prepared.preformatted ? "task-with-detail" : "task-only"
    },
    host.settings
  );
}
