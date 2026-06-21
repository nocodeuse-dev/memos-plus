import { Platform } from "obsidian";

export interface FocusableTarget {
  focus: () => void;
}

export function focusOnDesktopOnly(target: FocusableTarget | null | undefined): void {
  if (Platform.isMobile) {
    return;
  }
  target?.focus();
}
