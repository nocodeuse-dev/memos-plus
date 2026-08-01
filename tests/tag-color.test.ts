import { describe, expect, it } from "vitest";
import { TAG_COLOR_SLOT_COUNT, tagColorSlot } from "../src/tagColor";

describe("tag color slots", () => {
  it("keeps the same tag on the same color slot", () => {
    expect(tagColorSlot("Obsidian")).toBe(tagColorSlot(" obsidian "));
    expect(tagColorSlot("项目/memosplus")).toBe(tagColorSlot("项目/memosplus"));
  });

  it("always returns a bounded palette index", () => {
    for (const tag of ["Obsidian", "项目", "软件", "项目/memosplus", "中文标签", "🚀"] ) {
      expect(tagColorSlot(tag)).toBeGreaterThanOrEqual(0);
      expect(tagColorSlot(tag)).toBeLessThan(TAG_COLOR_SLOT_COUNT);
    }
  });

  it("distributes common tags across more than one color", () => {
    const colors = new Set(["Obsidian", "项目", "软件", "项目/memosplus"].map(tagColorSlot));
    expect(colors.size).toBe(4);
  });
});
