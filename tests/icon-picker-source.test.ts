import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const iconPickerPath = "src/iconPicker.ts";
const iconPickerSource = existsSync(iconPickerPath) ? readFileSync(iconPickerPath, "utf8") : "";
const groupModalSource = readFileSync("src/sidebarGroupModal.ts", "utf8");
const savedSearchModalSource = readFileSync("src/savedSearchModal.ts", "utf8");
const viewSource = readFileSync("src/view.ts", "utf8");

describe("visual icon picker source integration", () => {
  it("provides a reusable Obsidian icon picker modal", () => {
    expect(existsSync(iconPickerPath)).toBe(true);
    expect(iconPickerSource).toContain("class IconPickerModal");
    expect(iconPickerSource).toContain("getIconIds");
    expect(iconPickerSource).toContain("setIcon");
    expect(iconPickerSource).toContain("filterIconIds");
  });

  it("uses icon picker buttons instead of manual icon text inputs in sidebar editors", () => {
    expect(groupModalSource).toContain("IconPickerModal");
    expect(savedSearchModalSource).toContain("IconPickerModal");
    expect(groupModalSource).not.toContain("iconInput =");
    expect(savedSearchModalSource).not.toContain("iconInput =");
  });

  it("lets the fixed all-memos sidebar item use the same icon picker flow", () => {
    expect(viewSource).toContain("allMemosIcon");
    expect(viewSource).toContain("openAllMemosIconPicker");
    expect(viewSource).toContain("renderSidebarMoreAction");
  });
});
