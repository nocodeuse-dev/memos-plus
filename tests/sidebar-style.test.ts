import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("styles.css", "utf8");
const viewSource = readFileSync("src/view.ts", "utf8");

function cssRule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${escaped}\\s*\\{([^}]+)\\}`).exec(styles)?.[1] ?? "";
}

function cssRules(selector: string): string[] {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return Array.from(styles.matchAll(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`, "g")), (match) => match[1]);
}

describe("sidebar directory styles", () => {
  it("does not reserve fixed action columns that squeeze custom filter labels", () => {
    const rowRule = cssRule(".memos-plus-side-search-row");
    const actionRule = cssRule(".memos-plus-side-action");

    expect(rowRule).toContain("display: flex");
    expect(rowRule).not.toContain("grid-template-columns");
    expect(actionRule).toContain("display: none");
  });

  it("renders separators only between top-level sidebar sections", () => {
    const sectionRule = cssRule(".memos-plus-sidebar-section + .memos-plus-sidebar-section");

    expect(viewSource).toContain("memos-plus-sidebar-section memos-plus-sidebar-all-section");
    expect(viewSource).toContain("memos-plus-sidebar-section memos-plus-directory-section");
    expect(viewSource).toContain("memos-plus-directory-header");
    expect(viewSource).toContain("memos-plus-directory-add");
    expect(viewSource).not.toContain("memos-plus-sidebar-add-section");
    expect(viewSource).not.toContain("memos-plus-sidebar-tree-section");
    expect(sectionRule).toContain("border-top");
    expect(styles).not.toContain(".memos-plus-side-search-row + .memos-plus-side-search-row");
  });

  it("keeps the sidebar more button inside the same visual row", () => {
    const rowRule = cssRule(".memos-plus-side-search-row");
    const activeRowRule = cssRule(".memos-plus-side-search-row.is-active");
    const itemRule = cssRule(".memos-plus-side-item");
    const actionRule = cssRule(".memos-plus-side-action");

    expect(viewSource).toContain('container.addClass(item.active ? "is-active" : "is-inactive")');
    expect(rowRule).toContain("height: 30px");
    expect(rowRule).toContain("border-radius");
    expect(rowRule).toContain("background: var(--memos-plus-list-item-background)");
    expect(activeRowRule).toContain("var(--memos-plus-accent)");
    expect(itemRule).not.toContain("border-radius");
    expect(itemRule).toContain("background: transparent");
    expect(actionRule).not.toContain("flex: 0 0 22px");
  });

  it("uses low-cost mobile list item styling without extra rounded masks", () => {
    const viewRule = cssRule(".memos-plus-view");
    const mobileListRule = cssRules(
      ".memos-plus-side-search-row,\n  .memos-plus-quick-directory-row,\n  .memos-plus-quick-directory-result-card,\n  .memos-plus-card,\n  .memos-plus-mobile-light-item",
    ).at(-1) ?? "";
    const mobileActionRule = cssRules(
      ".memos-plus-side-action,\n  .memos-plus-side-more,\n  .memos-plus-card-more",
    ).at(-1) ?? "";

    expect(viewRule).toContain("--memos-plus-list-item-radius: 8px");
    expect(viewRule).toContain("--memos-plus-mobile-list-item-radius: 10px");
    expect(viewRule).toContain("--memos-plus-list-item-background: var(--background-primary-alt)");
    expect(styles).toContain("--memos-plus-list-item-radius: var(--memos-plus-mobile-list-item-radius)");
    expect(mobileListRule).toContain("border-radius: var(--memos-plus-mobile-list-item-radius)");
    expect(mobileListRule).toContain("box-shadow: none");
    expect(mobileListRule).toContain("filter: none");
    expect(mobileListRule).toContain("background-image: none");
    expect(mobileActionRule).toContain("border-radius: 0");
    expect(mobileActionRule).toContain("background: transparent");
    expect(mobileActionRule).toContain("background-image: none");
  });
});
