import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const viewSource = readFileSync("src/view.ts", "utf8");

describe("memo list scroll preservation", () => {
  it("preserves the main scroll position when memo list actions reload the view", () => {
    expect(viewSource).toContain("preserveScroll");
    expect(viewSource).toContain("captureMainScrollPosition");
    expect(viewSource).toContain("restoreMainScrollPosition");

    const runMemoActionBody = viewSource.match(/private async runMemoAction\([\s\S]*?\n {2}\}/)?.[0] ?? "";
    expect(runMemoActionBody).toContain("await this.reload({ preserveScroll: true })");

    const checkboxHandlerBody = viewSource.match(/checkbox\.addEventListener\("change", async \(\) => \{([\s\S]*?)\n {6}\}\);/)?.[1] ?? "";
    expect(checkboxHandlerBody).toContain("await this.reload({ preserveScroll: true })");
  });
});
