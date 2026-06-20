import { describe, expect, it } from "vitest";
import { applyComposerIndent, handleComposerEnter } from "../src/composerInput";

describe("handleComposerEnter", () => {
  it("continues an unordered list", () => {
    expect(handleComposerEnter("- item", 6, 6)).toEqual({
      value: "- item\n- ",
      selectionStart: 9,
      selectionEnd: 9
    });
  });

  it("continues a task list", () => {
    expect(handleComposerEnter("- [ ] task", 10, 10)).toEqual({
      value: "- [ ] task\n- [ ] ",
      selectionStart: 17,
      selectionEnd: 17
    });
  });

  it("continues an ordered list with the next number", () => {
    expect(handleComposerEnter("1. item", 7, 7)).toEqual({
      value: "1. item\n2. ",
      selectionStart: 11,
      selectionEnd: 11
    });
  });

  it("exits an empty unordered list item", () => {
    expect(handleComposerEnter("note\n- ", 7, 7)).toEqual({
      value: "note\n",
      selectionStart: 5,
      selectionEnd: 5
    });
  });

  it("lets plain lines use the native textarea enter behavior", () => {
    expect(handleComposerEnter("plain", 5, 5)).toBeNull();
  });
});

describe("applyComposerIndent", () => {
  it("indents the current line", () => {
    expect(applyComposerIndent("a\nb", 3, 3, "indent")).toEqual({
      value: "a\n  b",
      selectionStart: 5,
      selectionEnd: 5
    });
  });

  it("outdents the current line", () => {
    expect(applyComposerIndent("a\n  b", 5, 5, "outdent")).toEqual({
      value: "a\nb",
      selectionStart: 3,
      selectionEnd: 3
    });
  });

  it("indents selected lines", () => {
    expect(applyComposerIndent("a\nb\nc", 0, 5, "indent")).toEqual({
      value: "  a\n  b\n  c",
      selectionStart: 0,
      selectionEnd: 11
    });
  });
});
