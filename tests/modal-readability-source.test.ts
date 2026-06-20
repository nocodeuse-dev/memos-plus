import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("styles.css", "utf8");

function cssBlock(selector: string): string {
  const start = styles.indexOf(`${selector} {`);
  if (start === -1) {
    return "";
  }
  const end = styles.indexOf("\n}", start);
  return end === -1 ? styles.slice(start) : styles.slice(start, end);
}

describe("modal readability styles", () => {
  it("keeps send and template modal rows compact, left aligned, and truncated", () => {
    const projectTitle = cssBlock(".memos-plus-project-option-title");
    const projectTitleText = cssBlock(".memos-plus-project-option-title-text");
    const projectMeta = cssBlock(".memos-plus-project-option-meta,\n.memos-plus-project-section-hint,\n.memos-plus-project-empty");
    const templateName = cssBlock(".memos-plus-file-template-item-name");
    const templateMeta = cssBlock(".memos-plus-file-template-item-meta");

    expect(styles).toContain(".memos-plus-modal {");
    expect(styles).toContain("text-align: left;");
    expect(styles).toContain(".memos-plus-project-send-modal-shell");
    expect(styles).toContain(".memos-plus-project-send-modal-shell .modal-content");
    expect(styles).toContain(".memos-plus-project-send-modal");
    expect(styles).toContain("overflow-x: hidden;");
    expect(projectTitle).toContain("justify-content: flex-start;");
    expect(projectTitle).toContain("white-space: nowrap;");
    expect(projectTitle).toContain("text-overflow: ellipsis;");
    expect(projectTitle).toContain("min-width: 0;");
    expect(projectTitleText).toContain("min-width: 0;");
    expect(projectTitleText).toContain("text-overflow: ellipsis;");
    expect(projectMeta).toContain("white-space: nowrap;");
    expect(projectMeta).toContain("text-overflow: ellipsis;");
    expect(styles).toContain(".memos-plus-file-template-item-name");
    expect(templateName).toContain("white-space: nowrap;");
    expect(templateName).toContain("text-overflow: ellipsis;");
    expect(templateMeta).toContain("white-space: nowrap;");
    expect(templateMeta).toContain("text-overflow: ellipsis;");
    expect(styles).toContain(".memos-plus-project-send-modal-shell,");
    expect(styles).toContain(".memos-plus-file-template-modal");
    expect(styles).toContain("max-height: calc(100vh - 24px);");
    expect(styles).toContain("width: 100%;");
    expect(styles).toContain("scrollbar-width: none;");
  });
});
