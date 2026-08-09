import type { TaggedFileInfo } from "./fileSend";

const MAX_SMART_SEND_KEYWORDS = 8;
const MAX_SMART_SEND_RESULTS = 50;
export const DEFAULT_SMART_SEND_PRIORITY_TAGS = ["病", "解剖结构"];
const GENERIC_PHRASES = new Set([
  "典型病例",
  "病例",
  "表现",
  "内容",
  "文章",
  "资料",
  "相关资料",
  "详情",
  "视频",
  "教程"
]);

export interface SmartSendAnalysis {
  sourceTexts: string[];
  phrases: string[];
  keywords: string[];
}

export interface SmartSendRecommendations {
  analysis: SmartSendAnalysis;
  files: TaggedFileInfo[];
}

export function analyzeSmartSendContent(content: string): SmartSendAnalysis {
  const linkLabels = extractMarkdownLinkLabels(content);
  const sourceTexts = (linkLabels.length > 0 ? linkLabels : [content])
    .map(cleanSourceText)
    .filter(Boolean);
  const fragments = uniqueStrings(sourceTexts.flatMap(splitSearchFragments)).filter(isUsefulPhrase);
  const anchors = findRepeatedCjkAnchors(fragments);
  const keywords: string[] = [];

  if (anchors.length > 0) {
    for (const anchor of anchors) {
      appendUnique(keywords, anchor);
      for (const fragment of fragments) {
        const index = fragment.indexOf(anchor);
        if (index < 0) {
          continue;
        }
        appendUnique(keywords, fragment.slice(index));
        appendUnique(keywords, fragment);
      }
    }
  } else {
    for (const fragment of fragments) {
      appendUnique(keywords, fragment);
      for (const token of fragment.match(/[\p{Script=Han}]{2,12}|[\p{Letter}\p{Number}][\p{Letter}\p{Number}._+-]{2,}/gu) ?? []) {
        appendUnique(keywords, token);
      }
    }
  }

  const limitedKeywords = keywords.filter(isUsefulPhrase).slice(0, MAX_SMART_SEND_KEYWORDS);
  const anchorSet = new Set(anchors);
  const phrases = uniqueStrings([
    ...fragments,
    ...limitedKeywords.filter((keyword) => !anchorSet.has(keyword))
  ]).filter(isUsefulPhrase);
  return { sourceTexts, phrases, keywords: limitedKeywords };
}

export async function loadSmartSendRecommendations(
  content: string,
  searchFiles: (query: string) => Promise<TaggedFileInfo[]>,
  priorityTags: string[] = []
): Promise<SmartSendRecommendations> {
  const analysis = analyzeSmartSendContent(content);
  if (analysis.keywords.length === 0) {
    return { analysis, files: [] };
  }
  const resultGroups = await Promise.all(analysis.keywords.map((keyword) => searchFiles(keyword)));
  const byPath = new Map<string, TaggedFileInfo>();
  for (const file of resultGroups.flat()) {
    byPath.set(file.path, file);
  }
  return {
    analysis,
    files: rankSmartSendFileInfos([...byPath.values()], analysis, priorityTags).slice(0, MAX_SMART_SEND_RESULTS)
  };
}

export function rankSmartSendFileInfos(
  files: TaggedFileInfo[],
  analysis: SmartSendAnalysis,
  priorityTags: string[] = []
): TaggedFileInfo[] {
  const keywords = analysis.keywords.map(normalizeForMatch).filter(Boolean);
  const phrases = analysis.phrases.map(normalizeForMatch).filter(Boolean);
  const normalizedPriorityTags = normalizeSmartSendPriorityTags(priorityTags);
  return files
    .map((file) => {
      const name = normalizeForMatch(file.name);
      const target = normalizeForMatch(`${file.name} ${file.path}`);
      const matchedKeywords = keywords.filter((keyword) => target.includes(keyword));
      const matchedPhrases = phrases.filter((phrase) => target.includes(phrase));
      const exactNamePhrase = matchedPhrases.some((phrase) => name === phrase);
      const exactNameKeyword = matchedKeywords.some((keyword) => name === keyword);
      const longestPhrase = matchedPhrases.reduce((max, phrase) => Math.max(max, phrase.length), 0);
      const tier = matchedPhrases.length > 0 ? 3 : matchedKeywords.length > 1 ? 2 : matchedKeywords.length === 1 ? 1 : 0;
      const matchedPriorityTags = getSmartSendMatchedPriorityTags(file, normalizedPriorityTags);
      const priorityWeight = matchedPriorityTags.length > 0
        ? normalizedPriorityTags.length - normalizedPriorityTags.indexOf(matchedPriorityTags[0])
        : 0;
      return { file, tier, exactNamePhrase, exactNameKeyword, longestPhrase, matchedCount: matchedKeywords.length, matchedPriorityTags, priorityWeight };
    })
    .filter((item) => item.tier > 0)
    .sort(
      (left, right) =>
        right.tier - left.tier ||
        Number(right.exactNamePhrase) - Number(left.exactNamePhrase) ||
        Number(right.exactNameKeyword) - Number(left.exactNameKeyword) ||
        right.priorityWeight - left.priorityWeight ||
        right.matchedPriorityTags.length - left.matchedPriorityTags.length ||
        right.longestPhrase - left.longestPhrase ||
        right.matchedCount - left.matchedCount ||
        right.file.updatedAt - left.file.updatedAt ||
        left.file.name.localeCompare(right.file.name) ||
        left.file.path.localeCompare(right.file.path)
    )
    .map((item) => item.file);
}

export function normalizeSmartSendPriorityTags(value: unknown): string[] {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\n,，]+/) : [];
  const tags: string[] = [];
  for (const item of source) {
    if (typeof item !== "string") {
      continue;
    }
    const tag = item.trim().replace(/^#+/, "").replace(/\s+/g, "");
    if (tag && !tags.includes(tag)) {
      tags.push(tag);
    }
  }
  return tags;
}

export function getSmartSendMatchedPriorityTags(file: TaggedFileInfo, priorityTags: string[]): string[] {
  const fileTags = file.tags.map(normalizeTagForMatch).filter(Boolean);
  return normalizeSmartSendPriorityTags(priorityTags).filter((priorityTag) => {
    const normalizedPriority = normalizeTagForMatch(priorityTag);
    return fileTags.some((fileTag) => fileTag === normalizedPriority || fileTag.startsWith(`${normalizedPriority}/`));
  });
}

function extractMarkdownLinkLabels(content: string): string[] {
  const labels: string[] = [];
  const pattern = /\[([^\]\n]+)\]\([^\n)]*(?:\)[^\n)]*)?\)/g;
  for (const match of content.matchAll(pattern)) {
    if (match.index !== undefined && content[match.index - 1] === "!") {
      continue;
    }
    appendUnique(labels, match[1]);
  }
  return labels;
}

function cleanSourceText(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/[`*_~#>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSearchFragments(value: string): string[] {
  return value
    .split(/[|｜:：,，。；;、/\\\n\r\t()[\]{}<>《》“”"'!?！？]+|(?:合并|伴随|伴有|并发|以及|并且|或者|同时|和|与|及)/u)
    .flatMap((part) => part.match(/[\p{Script=Han}]{2,20}|[\p{Letter}\p{Number}][\p{Letter}\p{Number} ._+-]{2,40}/gu) ?? [])
    .map((part) => part.trim());
}

function findRepeatedCjkAnchors(fragments: string[]): string[] {
  const occurrences = new Map<string, Set<number>>();
  fragments.forEach((fragment, fragmentIndex) => {
    const cjkRuns = fragment.match(/[\p{Script=Han}]{2,20}/gu) ?? [];
    for (const run of cjkRuns) {
      const maxLength = Math.min(6, run.length);
      for (let length = 2; length <= maxLength; length += 1) {
        for (let start = 0; start + length <= run.length; start += 1) {
          const candidate = run.slice(start, start + length);
          const seenIn = occurrences.get(candidate) ?? new Set<number>();
          seenIn.add(fragmentIndex);
          occurrences.set(candidate, seenIn);
        }
      }
    }
  });
  const candidates = [...occurrences.entries()]
    .filter(([, fragmentIndexes]) => fragmentIndexes.size > 1)
    .map(([candidate]) => candidate)
    .sort((left, right) => right.length - left.length || left.localeCompare(right));
  const anchors: string[] = [];
  for (const candidate of candidates) {
    if (anchors.some((anchor) => anchor.includes(candidate) || candidate.includes(anchor))) {
      continue;
    }
    anchors.push(candidate);
    if (anchors.length >= 3) {
      break;
    }
  }
  return anchors;
}

function isUsefulPhrase(value: string): boolean {
  const normalized = value.trim();
  return normalized.length >= 2 && normalized.length <= 40 && !GENERIC_PHRASES.has(normalized);
}

function normalizeForMatch(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[\s_./\\-]+/g, "");
}

function normalizeTagForMatch(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().trim().replace(/^#+/, "").replace(/\s+/g, "");
}

function uniqueStrings(values: string[]): string[] {
  const result: string[] = [];
  for (const value of values) {
    appendUnique(result, value);
  }
  return result;
}

function appendUnique(values: string[], value: string): void {
  const normalized = value.trim();
  if (normalized && !values.includes(normalized)) {
    values.push(normalized);
  }
}
