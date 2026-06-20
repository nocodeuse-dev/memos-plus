import { describe, expect, it, vi } from "vitest";
import { debounce, effectivePageSize, iconPickerResultLimit, shouldUseLightweightMode, vaultSearchNeedsContent } from "../src/performance";
import { DEFAULT_SETTINGS, normalizeSettings } from "../src/settings";

vi.mock("obsidian", () => ({
  App: class {},
  Modal: class {},
  Notice: class {},
  PluginSettingTab: class {},
  Setting: class {},
  TFile: class {},
  TFolder: class {},
  normalizePath: (value: string) => value.replace(/\/+/g, "/").replace(/\/$/, "")
}));

describe("performance defaults", () => {
  it("keeps debug logging off and mobile performance mode on by default", () => {
    expect(DEFAULT_SETTINGS.performanceDebugMode).toBe(false);
    expect(DEFAULT_SETTINGS.mobilePerformanceMode).toBe(true);
    expect(DEFAULT_SETTINGS.performanceSafeMode).toBe(false);
    expect(normalizeSettings({})).toMatchObject({
      performanceDebugMode: false,
      mobilePerformanceMode: true,
      performanceSafeMode: false
    });
  });

  it("caps initial page size for mobile and safe mode", () => {
    const settings = normalizeSettings({ pageSize: 80 });
    expect(effectivePageSize(settings, false)).toBe(80);
    expect(effectivePageSize(settings, true)).toBe(20);
    expect(effectivePageSize({ ...settings, performanceSafeMode: true }, false)).toBe(20);
  });

  it("limits icon picker rendering more aggressively on mobile", () => {
    expect(iconPickerResultLimit(false)).toBe(100);
    expect(iconPickerResultLimit(true)).toBe(50);
  });

  it("treats only text and task vault-search conditions as requiring file body reads", () => {
    expect(vaultSearchNeedsContent({ field: "text", operator: "contains", value: "needle" })).toBe(true);
    expect(vaultSearchNeedsContent({ field: "task", operator: "exists" })).toBe(true);
    expect(vaultSearchNeedsContent({ field: "taskStatus", operator: "equals", value: "open" })).toBe(true);
    expect(vaultSearchNeedsContent({ field: "taskDueDate", operator: "equals", value: "$today" })).toBe(true);
    expect(vaultSearchNeedsContent({ field: "taskOverdue", operator: "exists" })).toBe(true);
    expect(vaultSearchNeedsContent({ field: "image", operator: "exists" })).toBe(false);
    expect(vaultSearchNeedsContent({ field: "link", operator: "exists" })).toBe(false);
  });

  it("reports lightweight mode for mobile performance mode or safe mode", () => {
    const settings = normalizeSettings({});
    expect(shouldUseLightweightMode(settings, false)).toBe(false);
    expect(shouldUseLightweightMode(settings, true)).toBe(true);
    expect(shouldUseLightweightMode({ ...settings, performanceSafeMode: true }, false)).toBe(true);
  });
});

describe("debounce", () => {
  it("coalesces repeated calls", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 200);

    debounced();
    debounced();
    vi.advanceTimersByTime(199);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});
