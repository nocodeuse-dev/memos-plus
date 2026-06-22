import { Menu, Notice, Platform, type App } from "obsidian";
import { prepareCalloutContent } from "./callout";
import type { ComposerWidget } from "./composerWidget";
import { t } from "./i18n";
import { sendContentToProject, type ProjectDeliveryResult } from "./projectDelivery";
import type { DefaultSendAction, MemosPlusSettings } from "./settings";
import type { MemosPlusStore } from "./store";

export type ComposerProjectMode = "project" | "tag" | "recent" | "search";

export interface ComposerActionsHost {
  app: App;
  store: MemosPlusStore;
  settings: MemosPlusSettings;
  persistSettings: () => Promise<void>;
  refreshViews: () => Promise<void>;
}

export interface ComposerActionsOptions {
  defaultSendAction?: () => DefaultSendAction;
  afterDefaultSave?: () => void | Promise<void>;
  afterProjectSend?: (delivery: ProjectDeliveryResult) => void | Promise<void>;
}

export interface ComposerActions {
  handleSend: () => Promise<void>;
  openSendMenu: () => void;
  saveDefault: () => Promise<void>;
  sendToProject: (initialMode?: ComposerProjectMode) => Promise<ProjectDeliveryResult | null>;
}

export function createComposerActions(
  host: ComposerActionsHost,
  getComposer: () => ComposerWidget | null,
  options: ComposerActionsOptions = {}
): ComposerActions {
  const currentAction = (): DefaultSendAction => options.defaultSendAction?.() ?? host.settings.defaultSendAction;

  const saveDefault = async (): Promise<void> => {
    const composer = getComposer();
    if (!composer) {
      return;
    }
    try {
      const now = new Date();
      const rawContent = composer.getValue();
      const activeFile = host.app.workspace.getActiveFile()?.basename ?? "";
      const prepared = prepareCalloutContent(rawContent, host.settings, composer.manualCalloutMode, {
        now,
        file: activeFile
      });
      await host.store.addMemo(prepared.content, now, { preformatted: prepared.preformatted });
      if (host.settings.clearAfterSave) {
        composer.clear();
      }
      composer.resetCalloutMode();
      await clearFailureDraft(host);
      await host.refreshViews();
      await options.afterDefaultSave?.();
    } catch (error) {
      console.error("Memos Plus: failed to save memo", error);
      await saveFailureDraft(host, composer);
    }
  };

  const sendToProject = async (initialMode: ComposerProjectMode = "project"): Promise<ProjectDeliveryResult | null> => {
    const composer = getComposer();
    if (!composer) {
      return null;
    }
    const lang = host.settings.language;
    const content = composer.getValue().trim();
    if (!content) {
      new Notice(t(lang, "notice.projectInputRequired"));
      focusComposerOnDesktop(composer);
      return null;
    }
    try {
      const delivery = await sendContentToProject(
        {
          app: host.app,
          store: host.store,
          settings: host.settings,
          persistSettings: host.persistSettings
        },
        content,
        {
          initialMode,
          manualCalloutMode: composer.manualCalloutMode,
          onSaveDefault: saveDefault
        }
      );
      if (!delivery) {
        return null;
      }
      new Notice(`${t(lang, delivery.mode === "file" ? "notice.sentToFile" : "notice.sentToProject")}${delivery.file.basename}`);
      if (delivery.clearAfterSend ?? host.settings.clearAfterSave) {
        composer.clear();
      }
      composer.resetCalloutMode();
      await clearFailureDraft(host);
      await host.refreshViews();
      await options.afterProjectSend?.(delivery);
      return delivery;
    } catch (error) {
      console.error("Memos Plus: failed to send composer content", error);
      await saveFailureDraft(host, composer);
      return null;
    }
  };

  const openSendMenu = (): void => {
    const composer = getComposer();
    const lang = host.settings.language;
    const menu = new Menu();
    menu.addItem((item) => {
      item
        .setTitle(t(lang, "sendAction.memo"))
        .setIcon("message-square-plus")
        .onClick(() => {
          void saveDefault();
        });
    });
    menu.addItem((item) => {
      item
        .setTitle(t(lang, "sendAction.project"))
        .setIcon("folder-input")
        .onClick(() => {
          void sendToProject("project");
        });
    });
    menu.addItem((item) => {
      item
        .setTitle(t(lang, "sendAction.file"))
        .setIcon("file-input")
        .setDisabled(!host.settings.sendToFileEnabled)
        .onClick(() => {
          void sendToProject("tag");
        });
    });
    const rect = composer?.element.getBoundingClientRect();
    menu.showAtPosition({ x: rect ? rect.right : 0, y: rect ? rect.bottom : 0 });
  };

  const handleSend = async (): Promise<void> => {
    const action = currentAction();
    if (action === "memo") {
      await saveDefault();
      return;
    }
    if (action === "ask") {
      openSendMenu();
      return;
    }
    await sendToProject("project");
  };

  return {
    handleSend,
    openSendMenu,
    saveDefault,
    sendToProject
  };
}

async function saveFailureDraft(host: ComposerActionsHost, composer: ComposerWidget): Promise<void> {
  if (!host.settings.sendFailureDraftEnabled) {
    return;
  }
  const content = composer.getValue();
  if (!content.trim()) {
    return;
  }
  host.settings.sendFailureDraftContent = content;
  try {
    await host.persistSettings();
  } catch (error) {
    console.error("Memos Plus: failed to persist send failure draft", error);
  }
  new Notice(t(host.settings.language, "notice.sendFailedDraftSaved"));
  focusComposerOnDesktop(composer);
}

async function clearFailureDraft(host: ComposerActionsHost): Promise<void> {
  if (!host.settings.sendFailureDraftContent) {
    return;
  }
  host.settings.sendFailureDraftContent = "";
  try {
    await host.persistSettings();
  } catch (error) {
    console.error("Memos Plus: failed to clear send failure draft", error);
  }
}

function focusComposerOnDesktop(composer: ComposerWidget): void {
  if (Platform.isMobile) {
    return;
  }
  composer.focus();
}
