import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const viewSource = readFileSync("src/view.ts", "utf8");

describe("sidebar row action menu", () => {
  it("keeps row actions inside one ellipsis menu instead of rendering every action button inline", () => {
    expect(viewSource).toContain("renderSidebarMoreAction");
    expect(viewSource).toContain("openSidebarGroupMenu");
    expect(viewSource).toContain("openSidebarSearchMenu");
    expect(viewSource).not.toContain("renderSideAction(row, \"pencil\"");
    expect(viewSource).not.toContain("renderSideAction(row, \"copy\"");
    expect(viewSource).not.toContain("renderSideAction(row, \"arrow-up\"");
    expect(viewSource).not.toContain("renderSideAction(row, \"arrow-down\"");
    expect(viewSource).not.toContain("renderSideAction(row, \"trash-2\"");
  });
});
