import { describe, expect, it, vi } from "vitest";
import {
  appendTags,
  extractFirstUrl,
  extractTitle,
  resolveClipboardMarkdownLink
} from "../src/linkCapture";

describe("link capture parsing", () => {
  it("extracts the first URL without trailing Chinese punctuation", () => {
    expect(extractFirstUrl("稍后阅读：https://example.com/page?x=1，记得看")).toBe("https://example.com/page?x=1");
  });

  it("turns a pure URL into a titled Markdown link", async () => {
    await expect(resolveClipboardMarkdownLink("https://example.com/page", async () => "Example Title")).resolves.toBe(
      "[Example Title](https://example.com/page)"
    );
  });

  it("uses a recognized Douyin share title without fetching the page", async () => {
    const fetchTitle = vi.fn(async () => "Fetched title");

    await expect(
      resolveClipboardMarkdownLink("3.45 “这是视频标题” https://v.douyin.com/abc/ 复制此链接，打开抖音搜索", fetchTitle)
    ).resolves.toBe("[这是视频标题](https://v.douyin.com/abc/)");
    expect(fetchTitle).not.toHaveBeenCalled();
  });

  it("keeps the Douyin title after the copy/open prompt", async () => {
    const fetchTitle = vi.fn(async () => "Fetched title");
    const shareText =
      "4.89 复制打开抖音，看看【云潮新闻的作品】刘强东：机器人会取代快递员，京东已为70万快递员兄... https://v.douyin.com/vUSBveHR_yI/ 05/21 :7pm aNj:/ T@y.gO";

    await expect(resolveClipboardMarkdownLink(shareText, fetchTitle)).resolves.toBe(
      "[云潮新闻的作品 刘强东：机器人会取代快递员，京东已为70万快递员兄...](https://v.douyin.com/vUSBveHR_yI/)"
    );
    expect(fetchTitle).not.toHaveBeenCalled();
  });

  it("prefers site-specific and Open Graph titles before HTML title", () => {
    expect(extractTitle("https://mp.weixin.qq.com/s/abc", '<script>var msg_title = "微信文章标题";</script>')).toBe("微信文章标题");
    expect(extractTitle("https://example.com", '<meta property="og:title" content="Open Graph"><title>Fallback</title>')).toBe(
      "Open Graph"
    );
  });

  it("keeps existing platform title cleanup for WeChat, Bilibili, Xiaohongshu, and ordinary pages", async () => {
    await expect(resolveClipboardMarkdownLink("https://mp.weixin.qq.com/s/abc", async () => "微信文章标题")).resolves.toBe(
      "[微信文章标题](https://mp.weixin.qq.com/s/abc)"
    );
    expect(extractTitle("https://www.bilibili.com/video/BV1xx", '<title>哔哩视频标题 - 哔哩哔哩</title>')).toBe("哔哩视频标题");
    expect(extractTitle("https://www.xiaohongshu.com/explore/abc", '<title>小红书笔记 - 小红书</title>')).toBe("小红书笔记");
    await expect(resolveClipboardMarkdownLink("https://example.com/page", async () => "普通网页标题")).resolves.toBe(
      "[普通网页标题](https://example.com/page)"
    );
  });

  it("decodes entities and removes common site suffixes", () => {
    expect(extractTitle("https://youtube.com/watch?v=1", '<meta property="og:title" content="Tiny &amp; Desk - YouTube">')).toBe(
      "Tiny & Desk"
    );
    expect(extractTitle("https://github.com/org/repo", '<title>Project · GitHub</title>')).toBe("Project");
  });

  it("falls back to the domain when fetching returns no title", async () => {
    await expect(resolveClipboardMarkdownLink("https://example.com/page", async () => "")).resolves.toBe("[example.com](https://example.com/page)");
  });

  it("escapes Markdown title characters and appends normalized tags", async () => {
    const link = await resolveClipboardMarkdownLink("https://example.com/page", async () => "A [B] *C*");

    expect(link).toBe("[A \\[B\\] \\*C\\*](https://example.com/page)");
    expect(appendTags(link ?? "", ["#链接", " 项目/AI ", ""])).toBe("[A \\[B\\] \\*C\\*](https://example.com/page) #链接 #项目/AI");
  });

  it("returns null when clipboard text has no URL", async () => {
    await expect(resolveClipboardMarkdownLink("只是一些文字", async () => "Title")).resolves.toBeNull();
  });
});
