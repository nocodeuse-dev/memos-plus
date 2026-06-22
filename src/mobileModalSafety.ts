import { Platform, type Modal } from "obsidian";
import { logMemosPlusDiagnostic } from "./diagnostics";

const activeMobileModals = new Set<Modal>();

export function isMobileModalSafeMode(): boolean {
  return Platform.isMobile;
}

export function mobileModalResultLimit(isMobile = Platform.isMobile): number {
  return isMobile ? 30 : 120;
}

export function registerMemosPlusModalOpen(modal: Modal, name: string): void {
  activeMobileModals.add(modal);
  logMemosPlusDiagnostic("modal:onOpen", {
    name,
    activeModalCount: activeMobileModals.size
  });
  if (Platform.isMobile && activeMobileModals.size > 1) {
    logMemosPlusDiagnostic("modal:stacked", {
      name,
      activeModalCount: activeMobileModals.size
    });
  }
}

export function registerMemosPlusModalClose(modal: Modal, name: string): void {
  activeMobileModals.delete(modal);
  logMemosPlusDiagnostic("modal:onClose", {
    name,
    activeModalCount: activeMobileModals.size
  });
}

export async function withMobileClickLock(target: HTMLElement | null | undefined, action: () => void | Promise<void>): Promise<void> {
  const shouldLock = Platform.isMobile && Boolean(target);
  if (shouldLock && target?.dataset.memosPlusClickLocked === "true") {
    logMemosPlusDiagnostic("modal:duplicate-click-blocked", {
      target: target.tagName.toLowerCase()
    });
    return;
  }
  if (shouldLock && target) {
    target.dataset.memosPlusClickLocked = "true";
  }
  const button = shouldLock && target instanceof HTMLButtonElement ? target : null;
  const wasDisabled = button?.disabled ?? false;
  if (button) {
    button.disabled = true;
  }
  try {
    await action();
  } catch (error) {
    logMemosPlusDiagnostic("modal:async-error", {
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    });
    console.error("[Memos Plus] Modal action failed", error);
  } finally {
    if (shouldLock && target) {
      delete target.dataset.memosPlusClickLocked;
    }
    if (button?.isConnected) {
      button.disabled = wasDisabled;
    }
  }
}
