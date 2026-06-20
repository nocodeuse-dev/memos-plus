import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const viewSource = readFileSync("src/view.ts", "utf8");
const widgetSource = readFileSync("src/composerWidget.ts", "utf8");

describe("composer send action", () => {
  it("does not render a dedicated send-to-project toolbar tool", () => {
    const tableIndex = widgetSource.indexOf('labelKey: "toolbar.insertTable"');
    const projectIndex = widgetSource.indexOf('labelKey: "toolbar.sendToProject"');

    expect(tableIndex).toBeGreaterThan(-1);
    expect(projectIndex).toBe(-1);
    expect(widgetSource).not.toContain('icon: "folder-input"');
    expect(viewSource).toContain("sendComposerToProject");
  });

  it("routes the visible send button through the default send action", () => {
    expect(viewSource).toContain("createComposerSession");
    expect(widgetSource).toContain("void this.options.onSend()");
    expect(viewSource).not.toContain("void this.saveComposer();\n    });\n  }\n\n  private async renderTimeline");
  });
});
