import type { MemoItem } from "./markdown";
import {
  filterMemosForOrganizerSection,
  type OrganizerMemoStates
} from "./organizerPanel";

export type MobileLightHomeSectionId = "inbox" | "recent";
export type MobileHomeLayout = "minimal" | "sidebar-only" | "sidebar-composer" | "composer-recent" | "full" | "custom";
export type MobileHomeModuleId =
  | "composer"
  | "sidebar"
  | "memoList"
  | "recent"
  | "organizer"
  | "tasks"
  | "tags"
  | "heatmap"
  | "stats"
  | "search"
  | "refresh";

export interface MobileLightHomeSectionSettings {
  visible: boolean;
  height: number;
}

export type MobileLightHomeSectionsSettings = Record<MobileLightHomeSectionId, MobileLightHomeSectionSettings>;
export type MobileHomeCustomModules = Record<MobileHomeModuleId, boolean>;

export interface MobileLightHomeSectionData {
  id: MobileLightHomeSectionId;
  labelKey: string;
  total: number;
  items: MemoItem[];
  settings: MobileLightHomeSectionSettings;
}

export const DEFAULT_MOBILE_LIGHT_HOME_RECENT_COUNT = 10;
export const DEFAULT_MOBILE_HOME_LAYOUT: MobileHomeLayout = "sidebar-composer";
export const DEFAULT_MOBILE_LIGHT_HOME_SECTIONS: MobileLightHomeSectionsSettings = {
  inbox: { visible: true, height: 160 },
  recent: { visible: true, height: 280 }
};
export const DEFAULT_MOBILE_HOME_CUSTOM_MODULES: MobileHomeCustomModules = {
  composer: true,
  sidebar: true,
  memoList: false,
  recent: true,
  organizer: true,
  tasks: true,
  tags: true,
  heatmap: false,
  stats: false,
  search: true,
  refresh: true
};

const MOBILE_LIGHT_HOME_SECTION_DEFINITIONS: Array<{ id: MobileLightHomeSectionId; labelKey: string }> = [
  { id: "inbox", labelKey: "mobileLightHome.section.inbox" },
  { id: "recent", labelKey: "mobileLightHome.section.recent" }
];
const MOBILE_HOME_LAYOUTS: MobileHomeLayout[] = ["minimal", "sidebar-only", "sidebar-composer", "composer-recent", "full", "custom"];
const MOBILE_HOME_MODULES: MobileHomeModuleId[] = [
  "composer",
  "sidebar",
  "memoList",
  "recent",
  "organizer",
  "tasks",
  "tags",
  "heatmap",
  "stats",
  "search",
  "refresh"
];
const MOBILE_HOME_MODULE_SET = new Set<string>(MOBILE_HOME_MODULES);
const DEFAULT_MOBILE_HOME_CUSTOM_MODULE_ENTRIES = Object.entries(DEFAULT_MOBILE_HOME_CUSTOM_MODULES) as Array<[MobileHomeModuleId, boolean]>;
const MOBILE_HOME_LAYOUT_SET = new Set<string>(MOBILE_HOME_LAYOUTS);

export function normalizeMobileHomeLayout(value: unknown): MobileHomeLayout {
  return typeof value === "string" && MOBILE_HOME_LAYOUT_SET.has(value) ? (value as MobileHomeLayout) : DEFAULT_MOBILE_HOME_LAYOUT;
}

export function normalizeMobileHomeCustomModules(value: unknown): MobileHomeCustomModules {
  const raw = isRecord(value) ? value : {};
  return DEFAULT_MOBILE_HOME_CUSTOM_MODULE_ENTRIES.reduce((modules, [id, defaultValue]) => {
    const candidate = MOBILE_HOME_MODULE_SET.has(id) ? raw[id] : undefined;
    modules[id] = typeof candidate === "boolean" ? candidate : defaultValue;
    return modules;
  }, {} as MobileHomeCustomModules);
}

export function normalizeMobileLightHomeRecentCount(value: unknown): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN;
  if (!Number.isFinite(parsed)) {
    return DEFAULT_MOBILE_LIGHT_HOME_RECENT_COUNT;
  }
  return Math.max(1, Math.min(30, Math.floor(parsed)));
}

export function normalizeMobileLightHomeHeight(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN;
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(96, Math.min(360, Math.floor(parsed)));
}

export function normalizeMobileLightHomeSections(value: unknown): MobileLightHomeSectionsSettings {
  const raw = isRecord(value) ? value : {};
  return MOBILE_LIGHT_HOME_SECTION_DEFINITIONS.reduce((sections, definition) => {
    const candidate = raw[definition.id];
    const item = isRecord(candidate) ? candidate : {};
    const defaults = DEFAULT_MOBILE_LIGHT_HOME_SECTIONS[definition.id];
    sections[definition.id] = {
      visible: typeof item.visible === "boolean" ? item.visible : defaults.visible,
      height: normalizeMobileLightHomeHeight(item.height, defaults.height)
    };
    return sections;
  }, {} as MobileLightHomeSectionsSettings);
}

export function buildMobileLightHomeSections(
  memos: MemoItem[],
  options: {
    today: string;
    states: OrganizerMemoStates;
    sectionSettings: MobileLightHomeSectionsSettings;
    recentCount: number;
  }
): MobileLightHomeSectionData[] {
  return MOBILE_LIGHT_HOME_SECTION_DEFINITIONS.flatMap((definition) => {
    const settings = options.sectionSettings[definition.id] ?? DEFAULT_MOBILE_LIGHT_HOME_SECTIONS[definition.id];
    if (!settings.visible) {
      return [];
    }
    const filtered = definition.id === "inbox" ? inboxMemos(memos, options.today, options.states) : recentMemos(memos);
    return [
      {
        ...definition,
        total: filtered.length,
        items: filtered.slice(0, options.recentCount),
        settings
      }
    ];
  });
}

export function memoPreviewText(memo: MemoItem): string {
  const firstLine = memo.content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return firstLine ? firstLine.replace(/^[-*+]\s+/, "").replace(/^\[[^\]]*]\s+/, "") : memo.filePath;
}

function inboxMemos(memos: MemoItem[], today: string, states: OrganizerMemoStates): MemoItem[] {
  return filterMemosForOrganizerSection("inbox", memos, { today, states });
}

function recentMemos(memos: MemoItem[]): MemoItem[] {
  return memos.filter((memo) => !memo.isArchived).sort((left, right) => right.datetime.getTime() - left.datetime.getTime());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
