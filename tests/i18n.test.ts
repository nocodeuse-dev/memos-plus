import { describe, expect, it } from "vitest";
import { DEFAULT_LANGUAGE, t } from "../src/i18n";

describe("i18n", () => {
  it("defaults to Chinese", () => {
    expect(DEFAULT_LANGUAGE).toBe("zh");
    expect(t(undefined, "views.all")).toBe("全部笔记");
  });

  it("returns English labels when selected", () => {
    expect(t("en", "views.today")).toBe("Today");
    expect(t("en", "settings.language")).toBe("Language");
  });

  it("labels the organizer directory as task management for users", () => {
    expect(t("zh", "organizer.directory")).toBe("任务管理");
    expect(t("zh", "settings.organizerPanel")).toBe("任务管理");
    expect(t("en", "organizer.directory")).toBe("Task management");
  });

  it("falls back to the key for unknown labels", () => {
    expect(t("zh", "missing.key")).toBe("missing.key");
  });
});
