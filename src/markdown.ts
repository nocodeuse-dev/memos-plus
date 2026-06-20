export const PIN_TAG = "置顶";
export const STAR_TAG = "收藏";
export const ARCHIVE_TAG = "归档";

export interface MemoRange {
  start: number;
  end: number;
}

export interface MemoItem {
  id: string;
  filePath: string;
  date: string;
  time: string;
  datetime: Date;
  year: string;
  month: string;
  weekday: string;
  content: string;
  tags: string[];
  isPinned: boolean;
  isStarred: boolean;
  isArchived: boolean;
  hasOpenTask: boolean;
  hasClosedTask: boolean;
  hasImage: boolean;
  hasLink: boolean;
  range: MemoRange;
}

export interface MemoDocument {
  source: string;
  memos: MemoItem[];
}

export interface NewMemoInput {
  date: string;
  time: string;
  content: string;
}

const YEAR_HEADING_RE = /^#\s+(\d{4})\s*$/;
const MONTH_HEADING_RE = /^##\s+(\d{4}-\d{2})\s*$/;
const DATE_HEADING_RE = /^###\s+(\d{4}-\d{2}-\d{2})(?:\s+(.+?))?\s*$/;
const MEMO_START_RE = /^-\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s*$/;
const ANY_HEADING_RE = /^#{1,6}\s+/;
const TASK_OPEN_RE = /(?:^|\n)\s*[-*+]\s+\[ \]\s+/;
const TASK_CLOSED_RE = /(?:^|\n)\s*[-*+]\s+\[[xX]\]\s+/;
const IMAGE_RE = /!\[[^\]]*]\([^)]+\)|!\[\[[^\]]+\.(?:png|jpe?g|gif|webp|svg|bmp|avif)(?:\|[^\]]*)?]]/i;
const LINK_RE = /\[[^\]]+]\([^)]+\)|\[\[[^\]]+]]|https?:\/\/[^\s)]+/i;

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export function parseMemoDocument(source: string, filePath = "memos.md"): MemoDocument {
  const lines = normalizeNewlines(source).split("\n");
  const memos: MemoItem[] = [];
  let currentYear = "";
  let currentMonth = "";
  let currentDate = "";
  let currentWeekday = "";

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const yearMatch = line.match(YEAR_HEADING_RE);
    if (yearMatch) {
      currentYear = yearMatch[1];
      continue;
    }

    const monthMatch = line.match(MONTH_HEADING_RE);
    if (monthMatch) {
      currentMonth = monthMatch[1];
      continue;
    }

    const dateMatch = line.match(DATE_HEADING_RE);
    if (dateMatch) {
      currentDate = dateMatch[1];
      currentWeekday = dateMatch[2] ?? weekdayForDate(currentDate);
      continue;
    }

    const memoMatch = line.match(MEMO_START_RE);
    if (!memoMatch) {
      continue;
    }

    const [date, time] = [memoMatch[1], memoMatch[2]];
    let next = index + 1;
    while (next < lines.length && !MEMO_START_RE.test(lines[next]) && !ANY_HEADING_RE.test(lines[next])) {
      next++;
    }

    let end = next - 1;
    while (end > index && lines[end].trim() === "") {
      end--;
    }

    const content = unindentMemoContent(lines.slice(index + 1, end + 1));
    const tags = extractTags(content);
    memos.push({
      id: `${filePath}:${index}`,
      filePath,
      date,
      time,
      datetime: parseLocalDatetime(date, time),
      year: currentYear || date.slice(0, 4),
      month: currentMonth || date.slice(0, 7),
      weekday: currentDate === date ? currentWeekday : weekdayForDate(date),
      content,
      tags,
      isPinned: tags.includes(PIN_TAG),
      isStarred: tags.includes(STAR_TAG),
      isArchived: tags.includes(ARCHIVE_TAG),
      hasOpenTask: TASK_OPEN_RE.test(content),
      hasClosedTask: TASK_CLOSED_RE.test(content),
      hasImage: IMAGE_RE.test(content),
      hasLink: stripImages(content).match(LINK_RE) !== null,
      range: { start: index, end }
    });
    index = next - 1;
  }

  return { source, memos };
}

export function insertMemo(source: string, memo: NewMemoInput): string {
  const lines = trimDocumentEnd(normalizeNewlines(source)).split("\n").filter((line, index, all) => {
    return !(all.length === 1 && index === 0 && line === "");
  });
  const block = buildMemoBlock(memo.date, memo.time, memo.content);
  const year = memo.date.slice(0, 4);
  const month = memo.date.slice(0, 7);
  const dateHeading = `### ${memo.date} ${weekdayForDate(memo.date)}`;

  if (lines.length === 0) {
    return [
      `# ${year}`,
      "",
      `## ${month}`,
      "",
      dateHeading,
      "",
      ...block,
      ""
    ].join("\n");
  }

  const dateIndex = findHeading(lines, new RegExp(`^###\\s+${escapeRegExp(memo.date)}(?:\\s|$)`));
  if (dateIndex >= 0) {
    const insertAt = findMemoInsertIndex(lines, dateIndex, memo.time);
    const prefixBlank = insertAt > 0 && lines[insertAt - 1]?.trim() !== "" ? [""] : [];
    const suffixBlank = insertAt < lines.length && lines[insertAt]?.trim() !== "" ? [""] : [];
    lines.splice(insertAt, 0, ...prefixBlank, ...block, ...suffixBlank);
    return `${lines.join("\n")}\n`;
  }

  const monthIndex = findHeading(lines, new RegExp(`^##\\s+${escapeRegExp(month)}\\s*$`));
  if (monthIndex >= 0) {
    const insertAt = findDateInsertIndex(lines, monthIndex, memo.date);
    lines.splice(insertAt, 0, "", dateHeading, "", ...block);
    return `${lines.join("\n")}\n`;
  }

  const yearIndex = findHeading(lines, new RegExp(`^#\\s+${escapeRegExp(year)}\\s*$`));
  if (yearIndex >= 0) {
    const insertAt = findMonthInsertIndex(lines, yearIndex, month);
    lines.splice(insertAt, 0, "", `## ${month}`, "", dateHeading, "", ...block);
    return `${lines.join("\n")}\n`;
  }

  lines.push("", `# ${year}`, "", `## ${month}`, "", dateHeading, "", ...block);
  return `${lines.join("\n")}\n`;
}

export function buildMemoBlock(date: string, time: string, content: string): string[] {
  const normalized = trimOuterBlankLines(normalizeNewlines(content).split("\n"));
  return [
    `- ${date} ${time}`,
    ...normalized.map((line) => (line.trim() === "" ? "" : `  ${line}`))
  ];
}

export function replaceMemoContent(source: string, memo: MemoItem, content: string): string {
  return replaceMemoBlock(source, memo, buildMemoBlock(memo.date, memo.time, content));
}

export function removeMemo(source: string, memo: MemoItem): string {
  const lines = normalizeNewlines(source).split("\n");
  let start = memo.range.start;
  let end = memo.range.end;
  while (end + 1 < lines.length && lines[end + 1].trim() === "") {
    end++;
    break;
  }
  if (start > 0 && lines[start - 1].trim() === "") {
    start--;
  }
  lines.splice(start, end - start + 1);
  return ensureTrailingNewline(lines.join("\n"));
}

export function toggleTaskAtLine(source: string, memo: MemoItem, contentLineIndex: number, checked: boolean): string {
  const contentLines = memo.content.split("\n");
  const current = contentLines[contentLineIndex];
  if (current === undefined) {
    return source;
  }
  contentLines[contentLineIndex] = checked
    ? current.replace(/^(\s*[-*+]\s+)\[ \]/, "$1[x]")
    : current.replace(/^(\s*[-*+]\s+)\[[xX]\]/, "$1[ ]");
  return replaceMemoContent(source, memo, contentLines.join("\n"));
}

export function setMemoTag(content: string, tag: string, enabled: boolean): string {
  const tagText = `#${tag}`;
  const lines = normalizeNewlines(content).split("\n");
  const joined = lines.join("\n");
  const tagPattern = new RegExp(`(^|\\s)#${escapeRegExp(tag)}(?=\\s|$)`);
  if (enabled && !tagPattern.test(joined)) {
    return trimDocumentEnd(`${joined}\n${tagText}`);
  }
  if (!enabled) {
    return trimDocumentEnd(joined.replace(tagPattern, "$1").replace(/[ \t]+$/gm, ""));
  }
  return content;
}

function replaceMemoBlock(source: string, memo: MemoItem, block: string[]): string {
  const lines = normalizeNewlines(source).split("\n");
  lines.splice(memo.range.start, memo.range.end - memo.range.start + 1, ...block);
  return ensureTrailingNewline(lines.join("\n"));
}

function findHeading(lines: string[], pattern: RegExp): number {
  return lines.findIndex((line) => pattern.test(line));
}

function findMemoInsertIndex(lines: string[], dateHeadingIndex: number, time: string): number {
  let sectionEnd = lines.length;
  for (let index = dateHeadingIndex + 1; index < lines.length; index++) {
    if (ANY_HEADING_RE.test(lines[index])) {
      sectionEnd = index;
      break;
    }
    const memoMatch = lines[index].match(MEMO_START_RE);
    if (memoMatch && memoMatch[2] > time) {
      return trimBlankBefore(lines, index);
    }
  }
  return trimBlankBefore(lines, sectionEnd);
}

function findDateInsertIndex(lines: string[], monthHeadingIndex: number, date: string): number {
  let sectionEnd = lines.length;
  for (let index = monthHeadingIndex + 1; index < lines.length; index++) {
    if (/^#{1,2}\s+/.test(lines[index])) {
      sectionEnd = index;
      break;
    }
    const dateMatch = lines[index].match(DATE_HEADING_RE);
    if (dateMatch && dateMatch[1] > date) {
      return trimBlankBefore(lines, index);
    }
  }
  return trimBlankBefore(lines, sectionEnd);
}

function findMonthInsertIndex(lines: string[], yearHeadingIndex: number, month: string): number {
  let sectionEnd = lines.length;
  for (let index = yearHeadingIndex + 1; index < lines.length; index++) {
    if (YEAR_HEADING_RE.test(lines[index])) {
      sectionEnd = index;
      break;
    }
    const monthMatch = lines[index].match(MONTH_HEADING_RE);
    if (monthMatch && monthMatch[1] > month) {
      return trimBlankBefore(lines, index);
    }
  }
  return trimBlankBefore(lines, sectionEnd);
}

function trimBlankBefore(lines: string[], index: number): number {
  let result = index;
  while (result > 0 && lines[result - 1]?.trim() === "") {
    result--;
  }
  return result;
}

function unindentMemoContent(lines: string[]): string {
  return trimOuterBlankLines(lines.map((line) => (line.startsWith("  ") ? line.slice(2) : line))).join("\n");
}

function trimOuterBlankLines(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === "") {
    start++;
  }
  while (end > start && lines[end - 1].trim() === "") {
    end--;
  }
  return lines.slice(start, end);
}

function extractTags(content: string): string[] {
  const tags = new Set<string>();
  const withoutCode = content
    .replace(/```[\s\S]*?```/g, "")
    .replace(/~~~[\s\S]*?~~~/g, "")
    .replace(/`[^`\n]*`/g, "");
  const tagRe = /#([A-Za-z0-9_\u4e00-\u9fff][A-Za-z0-9_\u4e00-\u9fff/-]*)/g;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(withoutCode)) !== null) {
    tags.add(match[1]);
  }
  return [...tags];
}

function stripImages(content: string): string {
  return content.replace(/!\[[^\]]*]\([^)]+\)|!\[\[[^\]]+]]/g, "");
}

function parseLocalDatetime(date: string, time: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

export function weekdayForDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return WEEKDAYS[new Date(year, month - 1, day).getDay()];
}

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function trimDocumentEnd(value: string): string {
  return normalizeNewlines(value).replace(/\n+$/g, "");
}

function ensureTrailingNewline(value: string): string {
  return `${trimDocumentEnd(value)}\n`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
