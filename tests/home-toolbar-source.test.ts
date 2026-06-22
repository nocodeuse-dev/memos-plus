import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const viewSource = readFileSync("src/view.ts", "utf8");

describe("home toolbar rendering source", () => {
  it("shares the search/settings/refresh toolbar between desktop home and mobile home list", () => {
    expect(viewSource).toContain("private renderHomeToolbar");

    const renderMainBlock = viewSource.slice(viewSource.indexOf("private async renderMain"), viewSource.indexOf("private activeLayoutDataNeeds"));
    const mobileListBlock = viewSource.slice(viewSource.indexOf("private async renderMobileHomeMemoList"), viewSource.indexOf("private renderMobileHomeFileCount"));

    expect(renderMainBlock).toContain("this.renderHomeToolbar(header, modules)");
    expect(mobileListBlock).toContain("this.renderHomeToolbar(listWrap, modules, \"memos-plus-mobile-home-toolbar\")");
  });

  it("keeps search input updates local to the timeline helper", () => {
    const toolbarBlock = viewSource.match(/private renderHomeToolbar\([\s\S]*?\n {2}\}/)?.[0] ?? "";
    expect(toolbarBlock).toContain('modules.has("searchBox")');
    expect(toolbarBlock).toContain("this.scheduleTimelineRender()");
    expect(toolbarBlock).not.toContain("void this.render()");
  });
});
