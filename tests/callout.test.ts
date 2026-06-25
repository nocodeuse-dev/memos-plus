import { describe, expect, it } from "vitest";
import {
  buildCalloutMarkdown,
  prepareCalloutContent,
  resolveCalloutTitle,
  shouldUseCalloutForContent,
  DEFAULT_CALLOUT_SETTINGS
} from "../src/callout";

describe("callout markdown", () => {
  it("wraps multiline content in a folded Obsidian callout", () => {
    expect(
      buildCalloutMarkdown("这是第一行\n这是第二行\n\n这是第四行", {
        type: "note",
        foldMode: "folded",
        title: "标题"
      })
    ).toBe(["> [!note]- 标题", "> 这是第一行", "> 这是第二行", ">", "> 这是第四行"].join("\n"));
  });

  it("supports non-folding and expanded callout markers", () => {
    expect(buildCalloutMarkdown("内容", { type: "tip", foldMode: "none", title: "提示" })).toBe("> [!tip] 提示\n> 内容");
    expect(buildCalloutMarkdown("内容", { type: "info", foldMode: "expanded", title: "信息" })).toBe("> [!info]+ 信息\n> 内容");
  });

  it("resolves title from the first line and truncates long titles", () => {
    const content = "abcdefghijklmnopqrstuvwxyz1234567890\n正文";
    expect(resolveCalloutTitle(content, DEFAULT_CALLOUT_SETTINGS, {})).toBe("abcdefghijklmnopqrstuvwxyz1234...");
  });

  it("uses the first non-empty content line for ordinary text", () => {
    expect(resolveCalloutTitle("\n\n普通标题\n正文", DEFAULT_CALLOUT_SETTINGS, {})).toBe("普通标题");
  });

  it("uses the first non-empty code content line instead of the opening fence", () => {
    expect(resolveCalloutTitle("```text\nObsidian 透视叠图插件可行吗？回答模型：GPT-5.5 Thinking\n```", DEFAULT_CALLOUT_SETTINGS, {})).toBe(
      "Obsidian 透视叠图插件可行吗？回答模型：GPT-5...."
    );
    expect(resolveCalloutTitle("```\n无语言代码标题\n```", DEFAULT_CALLOUT_SETTINGS, {})).toBe("无语言代码标题");
    expect(resolveCalloutTitle("~~~python\nprint('hello')\n~~~", DEFAULT_CALLOUT_SETTINGS, {})).toBe("print('hello')");
  });

  it("skips blank code lines and does not use closing fences as titles", () => {
    expect(resolveCalloutTitle("```js\n\nconst title = '有效内容';\n```", DEFAULT_CALLOUT_SETTINGS, {})).toBe("const title = '有效内容';");
    expect(
      resolveCalloutTitle("```text\n\n```", { ...DEFAULT_CALLOUT_SETTINGS, calloutTitleMode: "firstLine" }, { now: new Date(2026, 5, 14, 20, 40) })
    ).toBe("2026-06-14 20:40");
  });

  it("resolves custom title templates with project context variables", () => {
    expect(
      resolveCalloutTitle(
        "第一行",
        { ...DEFAULT_CALLOUT_SETTINGS, calloutTitleMode: "custom", calloutTitleTemplate: "{project} - {heading} - {date}" },
        { project: "Memos Plus", heading: "资料", now: new Date(2026, 5, 14, 20, 40) }
      )
    ).toBe("Memos Plus - 资料 - 2026-06-14");
  });

  it("auto-enables callout only for manual mode, long content, or long link summaries", () => {
    const settings = DEFAULT_CALLOUT_SETTINGS;
    expect(shouldUseCalloutForContent("短内容", settings, false)).toBe(false);
    expect(shouldUseCalloutForContent("短内容", settings, true)).toBe(true);
    expect(shouldUseCalloutForContent("一".repeat(301), settings, false)).toBe(true);
    expect(shouldUseCalloutForContent("1\n2\n3\n4\n5\n6", settings, false)).toBe(true);
    expect(shouldUseCalloutForContent("https://example.com\n短摘要", settings, false)).toBe(false);
    expect(shouldUseCalloutForContent(`https://example.com\n${"摘要".repeat(160)}`, settings, false)).toBe(true);
  });

  it("prepares callout content and marks it as preformatted when needed", () => {
    expect(
      prepareCalloutContent("项目需求\n第二行", DEFAULT_CALLOUT_SETTINGS, true, {
        now: new Date(2026, 5, 14, 20, 40)
      })
    ).toEqual({
      content: "> [!note]- 项目需求\n> 项目需求\n> 第二行",
      preformatted: true
    });

    expect(prepareCalloutContent("短内容", DEFAULT_CALLOUT_SETTINGS, false, {})).toEqual({
      content: "短内容",
      preformatted: false
    });
  });

  it("keeps fenced code block body intact while using code content as title", () => {
    const content = "```text\nObsidian 透视叠图插件可行吗？回答模型：GPT-5.5 Thinking\n```";
    expect(prepareCalloutContent(content, DEFAULT_CALLOUT_SETTINGS, true, {})).toEqual({
      content: [
        "> [!note]- Obsidian 透视叠图插件可行吗？回答模型：GPT-5....",
        "> ```text",
        "> Obsidian 透视叠图插件可行吗？回答模型：GPT-5.5 Thinking",
        "> ```"
      ].join("\n"),
      preformatted: true
    });
  });

  it("preserves empty quote lines inside fenced code callouts", () => {
    const content = "~~~\n\ninside\n~~~";
    expect(buildCalloutMarkdown(content, { type: "note", foldMode: "folded", title: "inside" })).toBe(
      ["> [!note]- inside", "> ~~~", ">", "> inside", "> ~~~"].join("\n")
    );
  });
});
