import { describe, expect, it, vi } from "vitest";
import {
  getIconOverride,
  iconOverrideIdForOrganizerFilter,
  normalizeIconOverrides,
  renderConfigurableIcon,
  type IconOverrides
} from "../src/configurableIcons";

const obsidianMock = vi.hoisted(() => ({
  setIcon: vi.fn()
}));

vi.mock("obsidian", () => ({
  getIconIds: () => ["alarm-clock", "calendar-check", "star"],
  setIcon: obsidianMock.setIcon
}));

describe("configurable icon helpers", () => {
  it("normalizes only emoji and built-in icon override configs", () => {
    expect(
      normalizeIconOverrides({
        "filter-important": { type: "emoji", value: "⭐" },
        "task-due-today": { type: "lucide", value: "calendar-check" },
        "bad-svg": { type: "svg", value: "<svg />" },
        "bad-url": { type: "url", value: "https://example.com/icon.svg" },
        "bad-html": { type: "emoji", value: "<b>!" }
      })
    ).toEqual({
      "filter-important": { type: "emoji", value: "⭐" },
      "task-due-today": { type: "lucide", value: "calendar-check" }
    });
  });

  it("falls back to the default icon when no override exists", () => {
    const overrides: IconOverrides = {
      "filter-important": { type: "emoji", value: "⭐" }
    };

    expect(getIconOverride(overrides, "filter-important", "star")).toEqual({ type: "emoji", value: "⭐" });
    expect(getIconOverride(overrides, "task-overdue", "alarm-clock")).toEqual({ type: "lucide", value: "alarm-clock" });
  });

  it("maps built-in organizer and task entries to stable override ids", () => {
    expect(iconOverrideIdForOrganizerFilter("links")).toBe("filter-links");
    expect(iconOverrideIdForOrganizerFilter("images")).toBe("filter-images");
    expect(iconOverrideIdForOrganizerFilter("tasks")).toBe("task-incomplete");
    expect(iconOverrideIdForOrganizerFilter("task-due-today")).toBe("task-due-today");
  });

  it("falls back to the default lucide icon when an icon name is unknown", () => {
    const container = {
      textContent: "",
      addClass: vi.fn(),
      removeClass: vi.fn(),
      createSpan: vi.fn()
    } as unknown as HTMLElement;

    renderConfigurableIcon(container, { type: "lucide", value: "not-a-real-icon" }, "star");

    expect(obsidianMock.setIcon).toHaveBeenCalledWith(container, "star");
  });
});
