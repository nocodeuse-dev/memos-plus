import { Platform, type Modal } from "obsidian";
import { logMemosPlusDiagnostic, setMemosPlusDiagnosticState } from "./diagnostics";

const activeMobileModals = new Set<Modal>();
const activeMobileModalNames = new Map<Modal, string>();
const activeMobileModalStack: Modal[] = [];
const lastMobileModalOpen = new Map<string, number>();

const MOBILE_MODAL_OPEN_GUARD_MS = 350;
const MOBILE_MODAL_MAX_STACK = 2;

export function isMobileModalSafeMode(): boolean {
  return Platform.isMobile;
}

export function mobileModalResultLimit(isMobile = Platform.isMobile): number {
  return isMobile ? 30 : 120;
}

export function registerMemosPlusModalOpen(modal: Modal, name: string): void {
  if (Platform.isMobile) {
    const now = Date.now();
    const lastOpen = lastMobileModalOpen.get(name) ?? 0;
    if (now - lastOpen < MOBILE_MODAL_OPEN_GUARD_MS) {
      logMemosPlusDiagnostic("modal:open-blocked", {
        name,
        activeModalCount: activeMobileModals.size,
        skipMs: now - lastOpen
      });
      modal.close();
      return;
    }
    lastMobileModalOpen.set(name, now);

    if (activeMobileModals.size >= MOBILE_MODAL_MAX_STACK) {
      const oldest = activeMobileModalStack[0];
      if (oldest) {
        const oldestName = activeMobileModalNames.get(oldest) ?? "";
        logMemosPlusDiagnostic("modal:stack-evicted", {
          name,
          activeModalCount: activeMobileModals.size,
          evictName: oldestName
        });
        oldest.close();
      }
    }
    activeMobileModals.add(modal);
    activeMobileModalNames.set(modal, name);
    activeMobileModalStack.push(modal);
  } else {
    activeMobileModals.add(modal);
    activeMobileModalNames.set(modal, name);
  }

  setMemosPlusDiagnosticState({ currentModal: name });
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
  activeMobileModalNames.delete(modal);
  const index = activeMobileModalStack.indexOf(modal);
  if (index >= 0) {
    activeMobileModalStack.splice(index, 1);
  }
  const remainingNames = Array.from(activeMobileModalNames.values());
  setMemosPlusDiagnosticState({ currentModal: remainingNames[remainingNames.length - 1] ?? "" });
  logMemosPlusDiagnostic("modal:onClose", {
    name,
    activeModalCount: activeMobileModals.size
  });
}

export async function withMobileClickLock(target: HTMLElement | null | undefined, action: () => void | Promise<void>): Promise<void> {
  const shouldLock = Platform.isMobile && Boolean(target);
  logMemosPlusDiagnostic("modal:option-click", {
    target: target ? target.tagName.toLowerCase() : "",
    text: target?.textContent?.trim().slice(0, 40) ?? "",
    locked: target?.dataset.memosPlusClickLocked === "true"
  });
  if (shouldLock && target?.dataset.memosPlusClickLocked === "true") {
    logMemosPlusDiagnostic("modal:duplicate-click-blocked", {
      target: target.tagName.toLowerCase()
    });
    return;
  }
  if (shouldLock && target) {
    target.dataset.memosPlusClickLocked = "true";
  }
  const button = shouldLock && target?.instanceOf(HTMLButtonElement) ? target : null;
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
