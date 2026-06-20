import { describe, expect, it } from "vitest";
import { applyComposerTool, formatImageEmbedInsertion, insertTableAtCursor, wrapCodeBlockAtCursor } from "../src/composerTools";

describe("Memoria-style composer tools", () => {
  it("inserts exactly a hash marker at the cursor", () => {
    expect(applyComposerTool("hello", 5, 5, "tag")).toEqual({
      value: "hello#",
      selectionStart: 6,
      selectionEnd: 6
    });
  });

  it("prefixes selected text with a hash marker", () => {
    expect(applyComposerTool("cat", 0, 3, "tag")).toEqual({
      value: "#cat",
      selectionStart: 4,
      selectionEnd: 4
    });
  });

  it("starts an unordered list on a new line when the cursor is mid-line", () => {
    expect(applyComposerTool("hello", 5, 5, "ul")).toEqual({
      value: "hello\n- ",
      selectionStart: 8,
      selectionEnd: 8
    });
  });

  it("adds a leading newline when selected unordered text starts mid-line", () => {
    expect(applyComposerTool("aa bb", 3, 5, "ul")).toEqual({
      value: "aa \n- bb",
      selectionStart: 8,
      selectionEnd: 8
    });
  });

  it("prefixes selected lines as an unordered list", () => {
    expect(applyComposerTool("a\nb", 0, 3, "ul")).toEqual({
      value: "- a\n- b",
      selectionStart: 7,
      selectionEnd: 7
    });
  });

  it("prefixes selected lines as an ordered list", () => {
    expect(applyComposerTool("a\nb", 0, 3, "ol")).toEqual({
      value: "1. a\n2. b",
      selectionStart: 9,
      selectionEnd: 9
    });
  });

  it("continues an ordered list from the previous numbered line", () => {
    expect(applyComposerTool("1. done\n", 8, 8, "ol")).toEqual({
      value: "1. done\n2. ",
      selectionStart: 11,
      selectionEnd: 11
    });
  });

  it("starts an ordered list on a new line when the cursor is mid-line", () => {
    expect(applyComposerTool("note", 4, 4, "ol")).toEqual({
      value: "note\n1. ",
      selectionStart: 8,
      selectionEnd: 8
    });
  });

  it("prefixes selected lines as tasks", () => {
    expect(applyComposerTool("a\nb", 0, 3, "task")).toEqual({
      value: "- [ ] a\n- [ ] b",
      selectionStart: 15,
      selectionEnd: 15
    });
  });

  it("inserts a Memoria-style markdown table with surrounding blank lines", () => {
    expect(insertTableAtCursor("before", 6, 6, 3, 2)).toEqual({
      value: "before\n\n|    |    |\n| -- | -- |\n|    |    |\n|    |    |\n",
      selectionStart: 56,
      selectionEnd: 56
    });
  });

  it("formats image embeds like Memoria after saving attachments", () => {
    expect(formatImageEmbedInsertion("hello", 5, 5, "memos-plus.png")).toEqual({
      value: "hello\n![[memos-plus.png]]\n",
      selectionStart: 26,
      selectionEnd: 26
    });
  });

  it("wraps selected text in a text code block", () => {
    expect(wrapCodeBlockAtCursor("before selected after", 7, 15)).toEqual({
      value: "before \n\n```text\nselected\n```\n\n after",
      selectionStart: 29,
      selectionEnd: 29
    });
  });

  it("wraps the whole composer when there is no selection", () => {
    expect(wrapCodeBlockAtCursor("line 1\nline 2", 6, 6)).toEqual({
      value: "```text\nline 1\nline 2\n```",
      selectionStart: 25,
      selectionEnd: 25
    });
  });

  it("places the cursor inside a new empty text code block", () => {
    expect(wrapCodeBlockAtCursor("", 0, 0)).toEqual({
      value: "```text\n\n```",
      selectionStart: 8,
      selectionEnd: 8
    });
  });
});
