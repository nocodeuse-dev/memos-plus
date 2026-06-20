import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const viewSource = readFileSync("src/view.ts", "utf8");

describe("memo card action menu", () => {
  it("keeps memo card actions behind one ellipsis menu instead of rendering every action button inline", () => {
    expect(viewSource).toContain("renderMemoMoreAction");
    expect(viewSource).toContain("openMemoActionMenu");
    expect(viewSource).not.toContain("this.renderIconAction(actions");
  });

  it("offers project transfer between edit and copy actions", () => {
    const menuStart = viewSource.indexOf("private openMemoActionMenu");
    const menuEnd = viewSource.indexOf("private openMemoEditModal", menuStart);
    const menuSource = viewSource.slice(menuStart, menuEnd);

    expect(menuSource).toContain('t(lang, "memo.transferToProject")');
    expect(menuSource).toContain('.setIcon("folder-input")');
    expect(menuSource).toContain("this.transferMemoToProject(memo)");
    expect(menuSource.indexOf('t(lang, "common.edit")')).toBeLessThan(menuSource.indexOf('t(lang, "memo.transferToProject")'));
    expect(menuSource.indexOf('t(lang, "memo.transferToProject")')).toBeLessThan(menuSource.indexOf('t(lang, "memo.copy")'));
  });
});
