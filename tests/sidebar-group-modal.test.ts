import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const viewSource = readFileSync("src/view.ts", "utf8");
const modalPath = "src/sidebarGroupModal.ts";

describe("sidebar group creation UI", () => {
  it("uses an Obsidian modal instead of browser prompts for group editing", () => {
    expect(existsSync(modalPath)).toBe(true);
    const modalSource = existsSync(modalPath) ? readFileSync(modalPath, "utf8") : "";
    expect(viewSource).not.toContain("window.prompt");
    expect(modalSource).toContain("extends Modal");
    expect(modalSource).toContain("SidebarGroupModal");
  });
});
