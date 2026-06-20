import { Notice, type App } from "obsidian";
import { prepareCalloutContent } from "./callout";
import { createComposerActions, type ComposerActions, type ComposerActionsOptions, type ComposerProjectMode } from "./composerActions";
import { ComposerWidget } from "./composerWidget";
import { shouldMemosHandleImagePaste } from "./imageHandling";
import { t } from "./i18n";
import {
  getQuickCaptureInitialContent,
  mergeComposerContent,
  openQuickCaptureContentPrompt,
  readClipboardImageSafely,
  readClipboardTextSafely,
  readCurrentEditorSelection,
  type QuickCaptureInitialContentMode,
  type QuickCaptureInitialContentResult
} from "./quickCaptureContent";
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
}

export interface ComposerSessionOptions extends ComposerActionsOptions {
  defaultSendAction?: () => DefaultSendAction;
  initialContent?: string;
  initialContentMode?: QuickCaptureInitialContentMode;
  showClipboardEmptyNotice?: boolean;
  onIncomingContentApplied?: () => void | Promise<void>;
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
    createExcalidrawAttachment: () => host.store.createExcalidrawAttachment(),
    registerCleanup: host.registerCleanup,
    sendActionTitle: options.defaultSendAction
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
      refreshViews: host.refreshViews
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
      await options.onIncomingContentApplied?.();
      return;
    }
    widget.setValue(mergeComposerContent(widget.getValue(), result.content, result.action));
    await options.onIncomingContentApplied?.();
    widget.focus();
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
      chooseAction: (request) => openQuickCaptureContentPrompt(host.app, host.settings.language, request)
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

export type { ComposerProjectMode };

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
