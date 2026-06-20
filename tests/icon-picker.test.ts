import { describe, expect, it, vi } from "vitest";
import { filterIconIds, normalizeIconName } from "../src/iconPicker";

vi.mock("obsidian", () => ({
  App: class {},
  Modal: class {},
  getIconIds: () => ["folder", "folder-plus", "check-square", "calendar"],
  setIcon: vi.fn()
}));

describe("icon picker helpers", () => {
  it("filters icon ids by a case-insensitive query", () => {
    expect(filterIconIds(["folder", "folder-plus", "check-square", "calendar"], "FOLDER")).toEqual(["folder", "folder-plus"]);
    expect(filterIconIds(["folder", "check-square"], "check")).toEqual(["check-square"]);
  });

  it("returns a stable default icon when a saved icon is missing", () => {
    expect(normalizeIconName("", "filter")).toBe("filter");
    expect(normalizeIconName(" folder ", "filter")).toBe("folder");
  });
});
