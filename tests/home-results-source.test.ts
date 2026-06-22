import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const viewSource = readFileSync("src/view.ts", "utf8");

describe("home result rendering source", () => {
  it("shares file count and file list rendering between desktop home and mobile home list", () => {
    expect(viewSource).toContain("private async renderHomeResults");

    const renderMainBlock = viewSource.slice(viewSource.indexOf("private async renderMain"), viewSource.indexOf("private activeLayoutDataNeeds"));
    const mobileListBlock = viewSource.slice(viewSource.indexOf("private async renderMobileHomeMemoList"), viewSource.indexOf("private renderHomeToolbar"));

    expect(renderMainBlock).toContain("await this.renderHomeResults(main, modules)");
    expect(mobileListBlock).toContain("await this.renderHomeResults(listWrap, modules)");
  });

  it("does not render the timeline when the file list module is hidden", () => {
    const resultsBlock = viewSource.match(/private async renderHomeResults\([\s\S]*?\n {2}\}/)?.[0] ?? "";
    expect(resultsBlock).toContain('modules.has("fileList")');
    expect(resultsBlock).toContain('modules.has("fileCount")');
    expect(resultsBlock.indexOf('modules.has("fileList")')).toBeLessThan(resultsBlock.indexOf("this.renderTimeline"));
  });
});
