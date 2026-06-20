import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const viewSource = readFileSync("src/view.ts", "utf8");

describe("view layout data loading source integration", () => {
  it("loads memo documents only when the active display modules need memo data", () => {
    expect(viewSource).toContain("activeLayoutDataNeeds");
    expect(viewSource).toContain('dataNeeds.has("memos")');

    const reloadBlock = viewSource.match(/async reload\([\s\S]*?\n {2}\}/)?.[0] ?? "";
    expect(reloadBlock).toContain("const dataNeeds = this.activeLayoutDataNeeds()");
    expect(reloadBlock).toContain('if (dataNeeds.has("memos"))');
    expect(reloadBlock.indexOf('dataNeeds.has("memos")')).toBeLessThan(reloadBlock.indexOf("this.plugin.store.readDocument"));
  });
});
