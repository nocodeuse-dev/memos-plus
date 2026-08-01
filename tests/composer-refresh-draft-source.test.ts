import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync("main.ts", "utf8");
const viewSource = readFileSync("src/view.ts", "utf8");
const sessionSource = readFileSync("src/composerSession.ts", "utf8");

describe("composer refresh draft safety", () => {
  it("captures the live main-view draft before destroying and rebuilding the composer", () => {
    const renderStart = viewSource.indexOf("async render(): Promise<void>");
    const destroy = viewSource.indexOf("this.composerSession?.destroy();", renderStart);
    const capture = viewSource.indexOf("this.composerSession?.widget.getValue()", renderStart);

    expect(capture).toBeGreaterThan(renderStart);
    expect(capture).toBeLessThan(destroy);
    expect(viewSource).toContain("this.transientComposerDraft = activeComposerDraft");
    expect(viewSource).toContain("initialContent,");
    expect(viewSource).toContain("if (initialContent !== undefined)");
  });

  it("does not interrupt a non-empty composer for background task-index refreshes", () => {
    expect(viewSource).toContain("hasActiveComposerInput()");
    expect(viewSource).toContain("widget.getValue() || widget.isFocused()");
    expect(mainSource).toContain('source === "task-index-change" && view.hasActiveComposerInput()');
    expect(mainSource).toContain('reason: "active-composer-draft"');
  });

  it("drops delayed auto-fill results when user input changed or the old composer was destroyed", () => {
    expect(sessionSource).toContain("const contentAtStart = widget.getValue()");
    expect(sessionSource).toContain("shouldApplyResolvedInitialContent(contentAtStart, widget.getValue(), destroyed)");
    expect(sessionSource).toContain("destroyed = true");
  });
});
