import { describe, expect, it, vi } from "vitest";
import { Platform } from "obsidian";
import { focusOnDesktopOnly } from "../src/modalFocus";

vi.mock("obsidian", () => ({
  Platform: {
    isMobile: false
  }
}));

describe("modal focus helpers", () => {
  it("focuses automatically on desktop", () => {
    const target = { focus: vi.fn() };
    Platform.isMobile = false;

    focusOnDesktopOnly(target);

    expect(target.focus).toHaveBeenCalledTimes(1);
  });

  it("does not focus automatically on mobile", () => {
    const target = { focus: vi.fn() };
    Platform.isMobile = true;

    focusOnDesktopOnly(target);

    expect(target.focus).not.toHaveBeenCalled();
  });
});
