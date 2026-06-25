import type { MemosPlusSettings } from "./settings";
import type { SavedSearchCondition } from "./savedSearch";
import { isTaskSearchField } from "./taskSearch";

export const MOBILE_PAGE_SIZE = 20;
export const DESKTOP_ICON_PICKER_LIMIT = 100;
export const MOBILE_ICON_PICKER_LIMIT = 50;
export const DESKTOP_MODAL_RESULT_LIMIT = 120;
export const MOBILE_MODAL_RESULT_LIMIT = 30;
export const SAFE_MODAL_RESULT_LIMIT = 20;
export const DESKTOP_DEBOUNCE_MS = 200;
export const MOBILE_DEBOUNCE_MS = 350;

export interface DebouncedFunction<T extends (...args: never[]) => void> {
  (...args: Parameters<T>): void;
  cancel: () => void;
}

export function shouldUseLightweightMode(settings: Pick<MemosPlusSettings, "mobilePerformanceMode" | "performanceSafeMode">, isMobile: boolean): boolean {
  return settings.performanceSafeMode || (settings.mobilePerformanceMode && isMobile);
}

export function effectivePageSize(settings: Pick<MemosPlusSettings, "pageSize" | "mobilePerformanceMode" | "performanceSafeMode">, isMobile: boolean): number {
  if (shouldUseLightweightMode(settings, isMobile)) {
    return MOBILE_PAGE_SIZE;
  }
  return Math.max(1, settings.pageSize);
}

export function iconPickerResultLimit(isMobile: boolean): number {
  return isMobile ? MOBILE_ICON_PICKER_LIMIT : DESKTOP_ICON_PICKER_LIMIT;
}

export function modalResultLimit(settings: Pick<MemosPlusSettings, "mobilePerformanceMode" | "performanceSafeMode">, isMobile: boolean): number {
  if (settings.performanceSafeMode) {
    return SAFE_MODAL_RESULT_LIMIT;
  }
  return shouldUseLightweightMode(settings, isMobile) ? MOBILE_MODAL_RESULT_LIMIT : DESKTOP_MODAL_RESULT_LIMIT;
}

export function debounceDelay(settings: Pick<MemosPlusSettings, "mobilePerformanceMode" | "performanceSafeMode">, isMobile: boolean): number {
  return shouldUseLightweightMode(settings, isMobile) ? MOBILE_DEBOUNCE_MS : DESKTOP_DEBOUNCE_MS;
}

export function modalDebounceDelay(settings: Pick<MemosPlusSettings, "mobilePerformanceMode" | "performanceSafeMode">, isMobile: boolean): number {
  return shouldUseLightweightMode(settings, isMobile) ? MOBILE_DEBOUNCE_MS : DESKTOP_DEBOUNCE_MS;
}

export function debounce<T extends (...args: never[]) => void>(fn: T, delayMs: number): DebouncedFunction<T> {
  let timer: number | null = null;
  const debounced = ((...args: Parameters<T>) => {
    if (timer) {
      window.clearTimeout(timer);
    }
    timer = window.setTimeout(() => {
      timer = null;
      fn(...args);
    }, delayMs);
  }) as DebouncedFunction<T>;
  debounced.cancel = () => {
    if (timer) {
      window.clearTimeout(timer);
      timer = null;
    }
  };
  return debounced;
}

export function vaultSearchNeedsContent(condition: SavedSearchCondition): boolean {
  return condition.field === "text" || condition.field === "task" || isTaskSearchField(condition.field);
}

export class PerformanceProfiler {
  constructor(
    private readonly enabled: boolean,
    private readonly prefix = "Memos Plus"
  ) {}

  async measure<T>(label: string, action: () => Promise<T>): Promise<T> {
    if (!this.enabled) {
      return action();
    }
    const start = performance.now();
    try {
      return await action();
    } finally {
      this.log(label, performance.now() - start);
    }
  }

  measureSync<T>(label: string, action: () => T): T {
    if (!this.enabled) {
      return action();
    }
    const start = performance.now();
    try {
      return action();
    } finally {
      this.log(label, performance.now() - start);
    }
  }

  log(label: string, durationMs: number): void {
    if (!this.enabled) {
      return;
    }
    console.warn(`[${this.prefix}] ${label}: ${durationMs.toFixed(1)}ms`);
  }
}
