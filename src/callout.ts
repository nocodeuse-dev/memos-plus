export const CALLOUT_TYPES = ["note", "info", "tip", "success", "question", "warning", "danger", "quote", "example", "abstract", "todo", "bug"] as const;
export type CalloutType = (typeof CALLOUT_TYPES)[number];

export type CalloutFoldMode = "none" | "folded" | "expanded";
export type CalloutTitleMode = "file" | "project" | "heading" | "datetime" | "firstLine" | "custom" | "ask";

export interface CalloutSettings {
  calloutEnabled: boolean;
  calloutType: CalloutType;
  calloutFoldMode: CalloutFoldMode;
  calloutTitleMode: CalloutTitleMode;
  calloutTitleTemplate: string;
  calloutAutoForLongContent: boolean;
  calloutAutoLength: number;
  calloutAutoLines: number;
  calloutAutoForLinks: boolean;
}

export interface CalloutContext {
  file?: string;
  project?: string;
  heading?: string;
  now?: Date;
}

export interface PreparedCalloutContent {
  content: string;
  preformatted: boolean;
}

export const DEFAULT_CALLOUT_SETTINGS: CalloutSettings = {
  calloutEnabled: true,
  calloutType: "note",
  calloutFoldMode: "folded",
  calloutTitleMode: "firstLine",
  calloutTitleTemplate: "{firstLine}",
  calloutAutoForLongContent: true,
  calloutAutoLength: 300,
  calloutAutoLines: 5,
  calloutAutoForLinks: true
};

export function buildCalloutMarkdown(content: string, options: { type: CalloutType; foldMode: CalloutFoldMode; title: string }): string {
  const marker = calloutFoldMarker(options.foldMode);
  const title = options.title.trim();
  const header = `> [!${options.type}]${marker}${title ? ` ${title}` : ""}`;
  const lines = normalizeNewlines(content).split("\n").map((line) => (line.trim() ? `> ${line}` : ">"));
  return [header, ...trimTrailingEmptyQuoteLines(lines)].join("\n");
}

export function prepareCalloutContent(content: string, settings: CalloutSettings, manualMode: boolean, context: CalloutContext): PreparedCalloutContent {
  if (!shouldUseCalloutForContent(content, settings, manualMode)) {
    return { content, preformatted: false };
  }
  return {
    content: buildCalloutMarkdown(content.trim(), {
      type: settings.calloutType,
      foldMode: settings.calloutFoldMode,
      title: resolveCalloutTitle(content, settings, context)
    }),
    preformatted: true
  };
}

export function shouldUseCalloutForContent(content: string, settings: CalloutSettings, manualMode: boolean): boolean {
  if (!settings.calloutEnabled) {
    return false;
  }
  if (manualMode) {
    return true;
  }
  const longEnough = isLongCalloutContent(content, settings);
  if (settings.calloutAutoForLongContent && longEnough) {
    return true;
  }
  return settings.calloutAutoForLinks && hasLink(content) && longEnough;
}

export function resolveCalloutTitle(content: string, settings: Pick<CalloutSettings, "calloutTitleMode" | "calloutTitleTemplate">, context: CalloutContext): string {
  const now = context.now ?? new Date();
  const values: Record<string, string> = {
    file: context.file ?? "",
    project: context.project ?? context.file ?? "",
    heading: context.heading ?? "",
    date: formatDate(now),
    time: formatTime(now),
    datetime: `${formatDate(now)} ${formatTime(now)}`,
    firstLine: extractCalloutFirstLine(content)
  };
  const mode = normalizeCalloutTitleMode(settings.calloutTitleMode);
  switch (mode) {
    case "file":
      return truncateTitle(values.file || values.firstLine);
    case "project":
      return truncateTitle(values.project || values.firstLine);
    case "heading":
      return truncateTitle(values.heading || values.firstLine);
    case "datetime":
      return values.datetime;
    case "custom":
      return truncateTitle(renderTitleTemplate(settings.calloutTitleTemplate, values) || values.firstLine);
    case "ask":
    case "firstLine":
    default:
      return truncateTitle(values.firstLine || values.datetime);
  }
}

export function normalizeCalloutType(value: unknown): CalloutType {
  return typeof value === "string" && (CALLOUT_TYPES as readonly string[]).includes(value) ? (value as CalloutType) : DEFAULT_CALLOUT_SETTINGS.calloutType;
}

export function normalizeCalloutFoldMode(value: unknown): CalloutFoldMode {
  return value === "none" || value === "expanded" ? value : DEFAULT_CALLOUT_SETTINGS.calloutFoldMode;
}

export function normalizeCalloutTitleMode(value: unknown): CalloutTitleMode {
  return value === "file" || value === "project" || value === "heading" || value === "datetime" || value === "custom" || value === "ask"
    ? value
    : DEFAULT_CALLOUT_SETTINGS.calloutTitleMode;
}

export function normalizeCalloutThreshold(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function isLongCalloutContent(content: string, settings: Pick<CalloutSettings, "calloutAutoLength" | "calloutAutoLines">): boolean {
  const normalized = normalizeNewlines(content).trim();
  if (!normalized) {
    return false;
  }
  return normalized.length > settings.calloutAutoLength || normalized.split("\n").length > settings.calloutAutoLines;
}

function calloutFoldMarker(mode: CalloutFoldMode): string {
  if (mode === "folded") {
    return "-";
  }
  if (mode === "expanded") {
    return "+";
  }
  return "";
}

export function extractCalloutFirstLine(content: string): string {
  const lines = normalizeNewlines(content).split("\n");
  const firstContentIndex = lines.findIndex((line) => line.trim());
  if (firstContentIndex < 0) {
    return "";
  }
  const openingFence = parseOpeningFence(lines[firstContentIndex]);
  if (!openingFence) {
    return lines[firstContentIndex].trim();
  }
  for (let index = firstContentIndex + 1; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (!trimmed) {
      continue;
    }
    if (isClosingFence(trimmed, openingFence.marker, openingFence.length)) {
      return "";
    }
    return trimmed;
  }
  return "";
}

function parseOpeningFence(line: string): { marker: "`" | "~"; length: number } | null {
  const match = line.trim().match(/^(`{3,}|~{3,})/);
  if (!match) {
    return null;
  }
  const fence = match[1];
  return { marker: fence[0] as "`" | "~", length: fence.length };
}

function isClosingFence(line: string, marker: "`" | "~", minLength: number): boolean {
  const pattern = marker === "`" ? /^`{3,}\s*$/ : /^~{3,}\s*$/;
  if (!pattern.test(line)) {
    return false;
  }
  return line.length >= minLength;
}

function renderTitleTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(file|project|heading|date|time|datetime|firstLine)\}/g, (_, key: string) => values[key] ?? "").trim();
}

function truncateTitle(value: string): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > 30 ? `${normalized.slice(0, 30)}...` : normalized;
}

function trimTrailingEmptyQuoteLines(lines: string[]): string[] {
  let end = lines.length;
  while (end > 0 && lines[end - 1] === ">") {
    end--;
  }
  return lines.slice(0, end);
}

function hasLink(content: string): boolean {
  return /https?:\/\/\S+/i.test(content);
}

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function formatDate(date: Date): string {
  return [String(date.getFullYear()), pad2(date.getMonth() + 1), pad2(date.getDate())].join("-");
}

function formatTime(date: Date): string {
  return [pad2(date.getHours()), pad2(date.getMinutes())].join(":");
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
