import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("styles.css", "utf8");
const composerWidgetSource = readFileSync("src/composerWidget.ts", "utf8");

function cssRule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${escaped}\\s*\\{([^}]+)\\}`).exec(styles)?.[1] ?? "";
}

function cssRules(selector: string): string[] {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return Array.from(styles.matchAll(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`, "g")), (match) => match[1]);
}

describe("mobile visual performance", () => {
  it("disables decorative shadows, gradients, filters, and transitions on mobile runtime surfaces", () => {
    const mobilePerformanceRule = cssRule(
      ".memos-plus-composer,\n  .memos-plus-fab,\n  .memos-plus-table-picker,\n  .memos-plus-saved-search-tag-suggestions,\n  .memos-plus-mobile-panel-tabs .memos-plus-project-send-tab,\n  .memos-plus-mobile-template-tabs .memos-plus-file-template-tab",
    );
    const mobileActiveTabRule = cssRule(
      ".memos-plus-mobile-panel-tabs .memos-plus-project-send-tab.is-active,\n  .memos-plus-mobile-template-tabs .memos-plus-file-template-tab.is-active",
    );
    const mobileFabHiddenRule = cssRules(
      ".memos-plus-shell.is-composer-focused .memos-plus-fab,\n  .memos-plus-shell.is-keyboard-open .memos-plus-fab,\n  .memos-plus-mobile-light-shell.is-composer-focused .memos-plus-fab,\n  .memos-plus-mobile-light-shell.is-keyboard-open .memos-plus-fab",
    ).at(-1) ?? "";

    expect(mobilePerformanceRule).toContain("box-shadow: none");
    expect(mobilePerformanceRule).toContain("filter: none");
    expect(mobilePerformanceRule).toContain("background-image: none");
    expect(mobilePerformanceRule).toContain("transition: none");
    expect(mobileActiveTabRule).toContain("box-shadow: none");
    expect(mobileActiveTabRule).toContain("border-bottom: 2px solid var(--interactive-accent)");
    expect(mobileFabHiddenRule).toContain("transform: none");
  });

  it("keeps settings previews cheap on narrow screens", () => {
    const mobileSettingsPreviewRule = cssRule(
      ".memos-plus-layout-region-heatmap,\n  .memos-plus-layout-inspector,\n  .memos-plus-layout-region,\n  .memos-plus-layout-mobile-row",
    );
    const mobileSettingsSelectedRule = cssRules(
      ".memos-plus-layout-region:hover,\n  .memos-plus-layout-region.is-selected,\n  .memos-plus-layout-mobile-row.is-selected",
    ).at(-1) ?? "";

    expect(mobileSettingsPreviewRule).toContain("background-image: none");
    expect(mobileSettingsPreviewRule).toContain("box-shadow: none");
    expect(mobileSettingsPreviewRule).toContain("filter: none");
    expect(mobileSettingsSelectedRule).toContain("box-shadow: none");
  });

  it("uses instant mobile keyboard reveal scrolling instead of smooth animated scroll", () => {
    const scrollBlock =
      composerWidgetSource.match(/private scrollComposerIntoView\(\): void \{[\s\S]*?\n {2}\}/)?.[0] ?? "";

    expect(scrollBlock).toContain('behavior: "instant"');
    expect(scrollBlock).not.toContain('behavior: "smooth"');
  });
});
