import { describe, expect, it } from "vitest";
import { isImageAutoUploadEnabled, normalizeImageHandlingMode, shouldMemosHandleImagePaste } from "../src/imageHandling";

function appWithEnabledPlugins(enabledPlugins: unknown, plugins: Record<string, unknown> = {}) {
  return {
    plugins: {
      enabledPlugins,
      plugins
    }
  };
}

describe("image handling mode", () => {
  it("normalizes image handling mode with auto as the safe default", () => {
    expect(normalizeImageHandlingMode(undefined)).toBe("auto");
    expect(normalizeImageHandlingMode("bad")).toBe("auto");
    expect(normalizeImageHandlingMode("memos")).toBe("memos");
    expect(normalizeImageHandlingMode("image-auto-upload")).toBe("image-auto-upload");
  });

  it("detects common Image Auto Upload plugin ids from enabled plugins", () => {
    expect(isImageAutoUploadEnabled(appWithEnabledPlugins(new Set(["obsidian-image-auto-upload-plugin"])))).toBe(true);
    expect(isImageAutoUploadEnabled(appWithEnabledPlugins(["image-auto-upload-plugin"]))).toBe(true);
    expect(isImageAutoUploadEnabled(appWithEnabledPlugins({ "image-auto-upload": true }))).toBe(true);
    expect(isImageAutoUploadEnabled(appWithEnabledPlugins(new Set(["other-plugin"])))).toBe(false);
  });

  it("falls back to loaded plugin records when enabled plugin ids are unavailable", () => {
    expect(isImageAutoUploadEnabled(appWithEnabledPlugins(undefined, { "obsidian-image-auto-upload-plugin": {} }))).toBe(true);
    expect(isImageAutoUploadEnabled(appWithEnabledPlugins(undefined, { "image-auto-upload-plugin": { enabled: true } }))).toBe(true);
    expect(isImageAutoUploadEnabled(appWithEnabledPlugins(undefined, { "image-auto-upload": { enabled: false } }))).toBe(false);
  });

  it("lets Memos Plus handle images only when the selected mode allows it", () => {
    const autoUploadApp = appWithEnabledPlugins(new Set(["obsidian-image-auto-upload-plugin"]));
    const plainApp = appWithEnabledPlugins(new Set(["other-plugin"]));

    expect(shouldMemosHandleImagePaste("memos", autoUploadApp)).toBe(true);
    expect(shouldMemosHandleImagePaste("image-auto-upload", plainApp)).toBe(false);
    expect(shouldMemosHandleImagePaste("auto", autoUploadApp)).toBe(false);
    expect(shouldMemosHandleImagePaste("auto", plainApp)).toBe(true);
  });
});
