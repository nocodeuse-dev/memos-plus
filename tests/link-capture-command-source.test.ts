import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync("main.ts", "utf8");
const actionSource = readFileSync("src/linkCaptureActions.ts", "utf8");

describe("link capture command source", () => {
  it("only keeps the default clipboard link capture command", () => {
    expect(mainSource).toContain("capture-clipboard-link-to-memos");
    expect(mainSource).not.toContain("capture-clipboard-link-to-project");
    expect(mainSource).not.toContain("command.linkCaptureProject");
    expect(actionSource).not.toContain("captureClipboardLinkToProject");
  });
});
