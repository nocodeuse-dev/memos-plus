import { describe, expect, it, vi } from "vitest";
import type { TaggedFileInfo } from "../src/fileSend";
import {
  analyzeSmartSendContent,
  loadSmartSendRecommendations,
  rankSmartSendFileInfos,
  type SmartSendAnalysis
} from "../src/smartSend";

function file(name: string, path = `${name}.md`, updatedAt = 0): TaggedFileInfo {
  return {
    file: { path, basename: name } as never,
    name,
    path,
    tags: [],
    matchTags: [],
    updatedAt
  };
}

describe("smart send", () => {
  it("prefers Markdown link labels and extracts nested medical phrases without reading the URL", () => {
    const analysis = analyzeSmartSendContent(
      "插件开发正文 [内侧半月板撕裂合并半月板旁囊肿 | 典型病例 MRI 表现](https://example.com/article?id=123)"
    );

    expect(analysis.sourceTexts).toEqual(["内侧半月板撕裂合并半月板旁囊肿 | 典型病例 MRI 表现"]);
    expect(analysis.keywords).toEqual(
      expect.arrayContaining(["半月板", "半月板撕裂", "内侧半月板撕裂", "半月板旁囊肿"])
    );
    expect(analysis.keywords.join(" ")).not.toContain("插件开发");
    expect(analysis.keywords.join(" ")).not.toContain("example");
  });

  it("ranks full phrases before multiple keyword matches and single keyword matches", () => {
    const analysis: SmartSendAnalysis = {
      sourceTexts: [],
      phrases: ["内侧半月板撕裂", "半月板旁囊肿"],
      keywords: ["半月板", "撕裂", "囊肿"]
    };

    expect(
      rankSmartSendFileInfos(
        [file("半月板资料"), file("半月板-囊肿归档"), file("内侧半月板撕裂"), file("无关文件")],
        analysis
      ).map((item) => item.name)
    ).toEqual(["内侧半月板撕裂", "半月板-囊肿归档", "半月板资料"]);
  });

  it("reuses the provided filename/path search callback and deduplicates its results", async () => {
    const shared = file("半月板撕裂病例", "医学/半月板撕裂病例.md");
    const search = vi.fn(async (query: string) => (query.includes("半月板") ? [shared] : []));

    const result = await loadSmartSendRecommendations("内侧半月板撕裂合并半月板旁囊肿", search);

    expect(search).toHaveBeenCalled();
    expect(search.mock.calls.map(([query]) => query)).toEqual(result.analysis.keywords);
    expect(result.files).toEqual([shared]);
  });

  it("returns no recommendation for content without a useful filename keyword", async () => {
    const search = vi.fn(async () => [file("不应读取")]);

    const result = await loadSmartSendRecommendations("! ?", search);

    expect(result.files).toEqual([]);
    expect(search).not.toHaveBeenCalled();
  });
});
