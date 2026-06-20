import { describe, expect, it, vi } from "vitest";
import { MemosPlusLinkSuggest, MemosPlusTagSuggest } from "../src/editorSuggest";

vi.mock("obsidian", () => ({
  EditorSuggest: class {
    context = null;

    constructor(readonly app: unknown) {}
  }
}));

function fakeEditor(line: string, insideComposer: boolean) {
  return {
    getLine: vi.fn(() => line),
    containerEl: {
      closest: vi.fn((selector: string) => (insideComposer && selector === ".memos-plus-composer" ? {} : null))
    },
    replaceRange: vi.fn()
  };
}

describe("Memos Plus editor suggestions", () => {
  it("triggers tag suggestions only inside the Memos Plus composer", () => {
    const app = { metadataCache: { getTags: () => ({ "#项目": 3, "#灵感": 1 }) } };
    const suggest = new MemosPlusTagSuggest(app as never);
    const inside = fakeEditor("memo #项", true);
    const outside = fakeEditor("memo #项", false);

    const trigger = suggest.onTrigger({ line: 0, ch: 7 }, inside as never);

    expect(trigger).toEqual({
      start: { line: 0, ch: 5 },
      end: { line: 0, ch: 7 },
      query: "项"
    });
    expect(suggest.onTrigger({ line: 0, ch: 7 }, outside as never)).toBeNull();
    expect(suggest.getSuggestions({ query: "项" } as never)).toEqual([{ tag: "项目", count: 3 }]);
  });

  it("triggers wikilink suggestions only inside the Memos Plus composer", () => {
    const app = {
      vault: {
        getMarkdownFiles: () => [
          { basename: "膝关节", path: "我的资源/膝关节.md" },
          { basename: "肩痛", path: "我的资源/肩痛.md" }
        ]
      }
    };
    const suggest = new MemosPlusLinkSuggest(app as never);
    const inside = fakeEditor("[[膝", true);
    const outside = fakeEditor("[[膝", false);

    const trigger = suggest.onTrigger({ line: 0, ch: 3 }, inside as never);

    expect(trigger).toEqual({
      start: { line: 0, ch: 0 },
      end: { line: 0, ch: 3 },
      query: "膝"
    });
    expect(suggest.onTrigger({ line: 0, ch: 3 }, outside as never)).toBeNull();
    expect(suggest.getSuggestions({ query: "膝" } as never)).toEqual([{ label: "膝关节", path: "我的资源/膝关节.md" }]);
  });
});
