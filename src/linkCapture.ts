export interface RequestResult {
  text: string;
  headers: Record<string, string>;
}

export type Requester = (url: string) => Promise<RequestResult>;
export type FetchTitle = (url: string) => Promise<string>;

export interface RecognizedShare {
  title: string;
  url: string;
}

export type LinkMetadataKind =
  | "web"
  | "github-repo"
  | "github-issue"
  | "github-pull"
  | "youtube"
  | "bilibili"
  | "zhihu"
  | "wechat"
  | "xiaohongshu"
  | "twitter"
  | "pubmed"
  | "doi"
  | "arxiv"
  | "notion";

export interface LinkMetadata {
  url: string;
  title: string;
  kind: LinkMetadataKind;
}

export interface LinkAnalysisOptions {
  maxLinks?: number;
  timeoutMs?: number;
}

const URL_PATTERN = /https?:\/\/[^\s<>"'“”‘’「」『』，。！？；：、（）【】]+/gi;
const DEFAULT_LINK_ANALYSIS_MAX_LINKS = 3;
const DEFAULT_LINK_ANALYSIS_TIMEOUT_MS = 4500;

export function extractFirstUrl(text: string): string | null {
  return extractLinksFromText(text)[0] ?? null;
}

export function extractLinksFromText(text: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const match of text.matchAll(URL_PATTERN)) {
    const normalized = normalizeExtractedUrl(match[0]);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

export async function resolveClipboardMarkdownLink(
  text: string,
  fetchTitle: FetchTitle,
  options: LinkAnalysisOptions = {}
): Promise<string | null> {
  const trimmed = text.trim();
  const links = extractLinksFromText(trimmed).slice(0, normalizeMaxLinks(options.maxLinks));
  if (links.length === 0) {
    return null;
  }

  const recognized = extractRecognizedShare(trimmed);
  if (recognized && links.length === 1) {
    return formatMarkdownLink(recognized.title, recognized.url);
  }

  const metadata = await Promise.all(links.map((url) => parseLinkMetadata(url, fetchTitle, options)));
  return metadata.map((item) => formatMarkdownLink(item.title, item.url)).join("\n");
}

export async function parseLinkMetadata(url: string, fetchTitle: FetchTitle, options: LinkAnalysisOptions = {}): Promise<LinkMetadata> {
  const kind = detectLinkKind(url);
  const fallback = fallbackMetadataTitle(url, kind);
  let title = "";
  try {
    title = await withTimeout(fetchTitle(url), normalizeTimeoutMs(options.timeoutMs));
  } catch {
    title = "";
  }
  return {
    url,
    kind,
    title: normalizeTitle(title) || fallback
  };
}

export async function fetchPageTitle(url: string, request: Requester): Promise<string> {
  try {
    const response = await request(url);
    const contentType = response.headers["content-type"] ?? response.headers["Content-Type"] ?? "";
    if (contentType && !contentType.toLowerCase().includes("text/html")) {
      return "";
    }
    return extractTitle(url, response.text);
  } catch {
    return "";
  }
}

export function extractRecognizedShare(text: string): RecognizedShare | null {
  const url = extractFirstUrl(text);
  if (!url || text.trim() === url) {
    return null;
  }

  const host = getHost(url);
  const isDouyin =
    host === "v.douyin.com" ||
    host.endsWith(".douyin.com") ||
    text.includes("复制此链接") ||
    text.includes("打开抖音");
  if (!isDouyin) {
    return null;
  }

  const title = cleanKnownShareTitle(text, url);
  return title ? { title, url } : null;
}

export function extractTitle(url: string, html: string): string {
  const host = getHost(url);
  let title = "";

  if (host === "mp.weixin.qq.com") {
    const match = html.match(/var\s+msg_title\s*=\s*['"](.+?)['"]/);
    title = decodeHtmlEntities(match?.[1] ?? "");
  } else if (host.includes("douyin.com")) {
    const description = getMetaContent(html, "og:description") || getMetaContent(html, "description");
    if (description && !description.includes("抖音")) {
      title = description;
    }
  }

  if (!title) {
    title = getMetaContent(html, "og:title") || getMetaContent(html, "twitter:title") || getMetaContent(html, "title") || getHtmlTitle(html);
  }

  return normalizeTitle(title);
}

export function detectLinkKind(url: string): LinkMetadataKind {
  const parsed = parseUrl(url);
  const host = parsed?.hostname.replace(/^www\./, "").toLowerCase() ?? "";
  const path = parsed?.pathname ?? "";
  if (host === "github.com") {
    if (/\/pull\/\d+(?:\/|$)/.test(path)) {
      return "github-pull";
    }
    if (/\/issues\/\d+(?:\/|$)/.test(path)) {
      return "github-issue";
    }
    if (githubRepoParts(parsed).length >= 2) {
      return "github-repo";
    }
  }
  if (host === "youtu.be" || host.endsWith("youtube.com")) {
    return "youtube";
  }
  if (host.endsWith("bilibili.com") || host === "b23.tv") {
    return "bilibili";
  }
  if (host.endsWith("zhihu.com")) {
    return "zhihu";
  }
  if (host === "mp.weixin.qq.com") {
    return "wechat";
  }
  if (host.endsWith("xiaohongshu.com") || host === "xhslink.com") {
    return "xiaohongshu";
  }
  if (host === "x.com" || host === "twitter.com" || host.endsWith(".twitter.com")) {
    return "twitter";
  }
  if (host === "pubmed.ncbi.nlm.nih.gov") {
    return "pubmed";
  }
  if (host === "doi.org" || host === "dx.doi.org") {
    return "doi";
  }
  if (host === "arxiv.org") {
    return "arxiv";
  }
  if (host.endsWith("notion.site") || host.endsWith("notion.so")) {
    return "notion";
  }
  return "web";
}

export function normalizeTitle(title: string): string {
  return decodeHtmlEntities(title)
    .replace(/\s*-\s*YouTube\s*$/i, "")
    .replace(/\s*-\s*抖音.*$/i, "")
    .replace(/\s*_\s*哔哩哔哩_bilibili\s*$/i, "")
    .replace(/\s*-\s*哔哩哔哩.*$/i, "")
    .replace(/\s*·\s*GitHub\s*$/i, "")
    .replace(/\s*-\s*知乎\s*$/i, "")
    .replace(/\s*-\s*Wikipedia\s*$/i, "")
    .replace(/\s*\/\s*X\s*$/i, "")
    .replace(/\s*-\s*小红书\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatMarkdownLink(title: string, url: string): string {
  return `[${escapeMarkdownTitle(title)}](${url})`;
}

export function appendTags(content: string, tags: unknown): string {
  const normalized = normalizeTagList(tags);
  if (normalized.length === 0) {
    return content;
  }
  return `${content.trim()} ${normalized.map((tag) => `#${tag}`).join(" ")}`;
}

export function normalizeTagList(value: unknown): string[] {
  const rawItems = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\s,，]+/) : [];
  const tags = rawItems.map(normalizeTag).filter(Boolean);
  return Array.from(new Set(tags));
}

export function normalizeTag(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().replace(/^#+/, "").replace(/\s+/g, "");
}

export function getHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function cleanKnownShareTitle(text: string, url: string): string {
  const quoted = text.match(/[“"「『](.+?)[”"」』]/);
  if (quoted?.[1]) {
    return quoted[1].trim();
  }

  const urlIndex = text.indexOf(url);
  const titleSource = urlIndex >= 0 ? text.slice(0, urlIndex) : text.replace(url, "");

  return titleSource
    .replace(/^\s*\d+(?:\.\d+)?\s*/, "")
    .replace(/^复制(?:此链接)?\s*/, "")
    .replace(/^打开抖音[，,、\s]*(?:看看|搜索)?\s*/, "")
    .replace(/^看看[，,、\s]*/, "")
    .replace(/\s*复制此链接.*$/g, "")
    .replace(/\s*打开抖音搜索.*$/g, "")
    .replace(/#[^\s#]+/g, "")
    .replace(/^【([^】]+)】\s*/, "$1 ")
    .replace(/\s+/g, " ")
    .trim();
}

function fallbackTitle(url: string): string {
  return getHost(url) || "链接";
}

function fallbackMetadataTitle(url: string, kind: LinkMetadataKind): string {
  const parsed = parseUrl(url);
  if (kind === "github-repo" || kind === "github-issue" || kind === "github-pull") {
    const [owner, repo] = githubRepoParts(parsed);
    const number = parsed?.pathname.match(/\/(?:issues|pull)\/(\d+)(?:\/|$)/)?.[1];
    if (owner && repo && number && kind === "github-issue") {
      return `GitHub issue ${owner}/${repo} #${number}`;
    }
    if (owner && repo && number && kind === "github-pull") {
      return `GitHub pull request ${owner}/${repo} #${number}`;
    }
    if (owner && repo) {
      return `GitHub ${owner}/${repo}`;
    }
  }
  if (kind === "pubmed") {
    const pmid = parsed?.pathname.match(/\/(\d+)(?:\/|$)/)?.[1];
    return pmid ? `PubMed ${pmid}` : "PubMed";
  }
  if (kind === "doi") {
    const doi = parsed?.pathname.replace(/^\/+/, "");
    return doi ? `DOI ${doi}` : "DOI";
  }
  if (kind === "arxiv") {
    const arxivId = parsed?.pathname.match(/\/(?:abs|pdf)\/([^/?#]+)(?:\.pdf)?/)?.[1];
    return arxivId ? `arXiv ${arxivId}` : "arXiv";
  }
  return fallbackTitle(url);
}

function githubRepoParts(parsed: URL | null): string[] {
  return parsed?.pathname.split("/").filter(Boolean).slice(0, 2) ?? [];
}

function parseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function normalizeExtractedUrl(value: string): string {
  let url = value.trim();
  while (url && shouldTrimTrailingUrlChar(url)) {
    url = url.slice(0, -1);
  }
  return parseUrl(url) ? url : "";
}

function shouldTrimTrailingUrlChar(url: string): boolean {
  const char = url.at(-1) ?? "";
  if (/[\u3002\uff0c\uff1b\uff1a\uff01\uff1f\u3001,;:!?。；：！，、]/.test(char)) {
    return true;
  }
  if (/[)\]}）】》〉]/.test(char)) {
    return countOpeningPairs(url, char) < countClosingPairs(url, char);
  }
  return false;
}

function countOpeningPairs(url: string, closingChar: string): number {
  const opening = matchingOpeningChar(closingChar);
  return opening ? countChar(url, opening) : 0;
}

function countClosingPairs(url: string, closingChar: string): number {
  return countChar(url, closingChar);
}

function matchingOpeningChar(closingChar: string): string {
  return (
    {
      ")": "(",
      "]": "[",
      "}": "{",
      "）": "（",
      "】": "【",
      "》": "《",
      "〉": "〈"
    } as Record<string, string>
  )[closingChar] ?? "";
}

function countChar(value: string, char: string): number {
  return Array.from(value).filter((item) => item === char).length;
}

function normalizeMaxLinks(value: number | undefined): number {
  return Math.max(1, Math.min(10, Math.floor(value ?? DEFAULT_LINK_ANALYSIS_MAX_LINKS)));
}

function normalizeTimeoutMs(value: number | undefined): number {
  return Math.max(1, Math.min(10000, Math.floor(value ?? DEFAULT_LINK_ANALYSIS_TIMEOUT_MS)));
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Link analysis timed out")), timeoutMs);
      })
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function escapeMarkdownTitle(title: string): string {
  return title
    .trim()
    .replace(/\\([*_`|<>~[\]\\])/g, "$1")
    .replace(/([*_`|<>~[\]\\])/g, "\\$1");
}

function decodeHtmlEntities(text: string): string {
  if (!text) {
    return "";
  }

  return text
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, value: string) => String.fromCodePoint(Number(value)))
    .replace(/&#x([\da-f]+);/gi, (_, value: string) => String.fromCodePoint(Number.parseInt(value, 16)));
}

function getAttribute(tag: string, name: string): string {
  const expression = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i");
  const match = tag.match(expression);
  return match?.[1] ?? match?.[2] ?? "";
}

function getMetaContent(html: string, value: string): string {
  const metaTags = html.match(/<meta\s+[^>]*>/gi) ?? [];

  for (const tag of metaTags) {
    const key = getAttribute(tag, "property") || getAttribute(tag, "name");
    if (key.toLowerCase() === value.toLowerCase()) {
      return decodeHtmlEntities(getAttribute(tag, "content")).trim();
    }
  }

  return "";
}

function getHtmlTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return decodeHtmlEntities(match?.[1] ?? "").replace(/\s+/g, " ").trim();
}
