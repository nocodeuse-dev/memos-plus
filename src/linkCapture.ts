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

const URL_PATTERN = /https?:\/\/[^\s<>"'“”‘’「」『』，。！？；：、（）【】]+/i;

export function extractFirstUrl(text: string): string | null {
  return text.match(URL_PATTERN)?.[0] ?? null;
}

export async function resolveClipboardMarkdownLink(text: string, fetchTitle: FetchTitle): Promise<string | null> {
  const trimmed = text.trim();
  const url = extractFirstUrl(trimmed);
  if (!url) {
    return null;
  }

  const recognized = extractRecognizedShare(trimmed);
  if (recognized) {
    return formatMarkdownLink(recognized.title, recognized.url);
  }

  let title = "";
  try {
    title = await fetchTitle(url);
  } catch {
    title = "";
  }

  return formatMarkdownLink(title || fallbackTitle(url), url);
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
