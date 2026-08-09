import { describe, expect, it, vi } from "vitest";
import type { TaggedFileInfo } from "../src/fileSend";
import {
  analyzeSmartSendContent,
  getSmartSendMatchedPriorityTags,
  loadSmartSendRecommendations,
  normalizeSmartSendPriorityTags,
  rankSmartSendFileInfos,
  type SmartSendAnalysis
} from "../src/smartSend";

function file(name: string, path = `${name}.md`, updatedAt = 0, tags: string[] = []): TaggedFileInfo {
  return {
    file: { path, basename: name } as never,
    name,
    path,
    tags,
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

  it("uses ordered priority tags only as a boost among relevant files", () => {
    const analysis: SmartSendAnalysis = {
      sourceTexts: [],
      phrases: [],
      keywords: ["半月板"]
    };
    const ranked = rankSmartSendFileInfos(
      [
        file("半月板普通资料"),
        file("半月板解剖资料", "解剖/半月板解剖资料.md", 0, ["解剖结构"]),
        file("半月板疾病资料", "疾病/半月板疾病资料.md", 0, ["病/膝关节"]),
        file("肩袖损伤", "疾病/肩袖损伤.md", 0, ["病"])
      ],
      analysis,
      ["病", "解剖结构"]
    );

    expect(ranked.map((item) => item.name)).toEqual(["半月板疾病资料", "半月板解剖资料", "半月板普通资料"]);
    expect(getSmartSendMatchedPriorityTags(ranked[0], ["病", "解剖结构"])).toEqual(["病"]);
  });

  it("keeps stronger filename relevance ahead of a weaker tagged match", () => {
    const analysis: SmartSendAnalysis = {
      sourceTexts: [],
      phrases: ["内侧半月板撕裂"],
      keywords: ["半月板", "撕裂"]
    };

    expect(
      rankSmartSendFileInfos(
        [file("内侧半月板撕裂"), file("半月板普通资料", "疾病/半月板普通资料.md", 0, ["病"])],
        analysis,
        ["病"]
      ).map((item) => item.name)
    ).toEqual(["内侧半月板撕裂", "半月板普通资料"]);
  });

  it("normalizes editable priority tags while preserving their order", () => {
    expect(normalizeSmartSendPriorityTags("#病\n 解剖结构\n病\n治疗")).toEqual(["病", "解剖结构", "治疗"]);
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
