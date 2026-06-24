import * as Obsidian from "obsidian";
import type { IconName } from "obsidian";
import type { OrganizerFilterId } from "./organizerPanel";

export type IconOverrideType = "emoji" | "lucide";

export interface IconOverrideConfig {
  type: IconOverrideType;
  value: string;
}

export type IconOverrides = Record<string, IconOverrideConfig>;

export interface ConfigurableIconItemDefinition {
  id: string;
  labelKey: string;
  fallbackIcon: string;
}

export const CONFIGURABLE_ICON_ITEM_DEFINITIONS: ConfigurableIconItemDefinition[] = [
  { id: "all-notes", labelKey: "views.all", fallbackIcon: "layout-grid" },
  { id: "filter-inbox", labelKey: "organizer.section.inbox", fallbackIcon: "inbox" },
  { id: "filter-today", labelKey: "organizer.section.today", fallbackIcon: "calendar-days" },
  { id: "filter-unarchived", labelKey: "organizer.section.unarchived", fallbackIcon: "archive-restore" },
  { id: "filter-links", labelKey: "organizer.section.links", fallbackIcon: "link" },
  { id: "filter-images", labelKey: "organizer.section.images", fallbackIcon: "image" },
  { id: "task-incomplete", labelKey: "organizer.section.tasks", fallbackIcon: "list-checks" },
  { id: "task-priority-highest", labelKey: "organizer.taskBranch.priorityHighest", fallbackIcon: "chevrons-up" },
  { id: "task-priority-high", labelKey: "organizer.taskBranch.priorityHigh", fallbackIcon: "chevron-up" },
  { id: "task-priority-medium", labelKey: "organizer.taskBranch.priorityMedium", fallbackIcon: "arrow-up" },
  { id: "task-priority-low", labelKey: "organizer.taskBranch.priorityLow", fallbackIcon: "chevron-down" },
  { id: "task-priority-lowest", labelKey: "organizer.taskBranch.priorityLowest", fallbackIcon: "chevrons-down" },
  { id: "task-priority-none", labelKey: "organizer.taskBranch.priorityNone", fallbackIcon: "circle" },
  { id: "task-overdue", labelKey: "organizer.taskBranch.overdue", fallbackIcon: "alarm-clock" },
  { id: "task-due-today", labelKey: "organizer.taskBranch.dueToday", fallbackIcon: "calendar-check" },
  { id: "task-due-this-week", labelKey: "organizer.taskBranch.dueThisWeek", fallbackIcon: "calendar-range" }
];

const ORGANIZER_ICON_OVERRIDE_IDS: Record<OrganizerFilterId, string> = {
  inbox: "filter-inbox",
  today: "filter-today",
  unarchived: "filter-unarchived",
  links: "filter-links",
  images: "filter-images",
  tasks: "task-incomplete",
  "task-priority-highest": "task-priority-highest",
  "task-priority-high": "task-priority-high",
  "task-priority-medium": "task-priority-medium",
  "task-priority-low": "task-priority-low",
  "task-priority-lowest": "task-priority-lowest",
  "task-priority-none": "task-priority-none",
  "task-overdue": "task-overdue",
  "task-due-today": "task-due-today",
  "task-due-this-week": "task-due-this-week"
};

export function normalizeIconOverrides(value: unknown): IconOverrides {
  if (!isRecord(value)) {
    return {};
  }
  const result: IconOverrides = {};
  for (const [itemId, config] of Object.entries(value)) {
    if (!itemId.trim()) {
      continue;
    }
    const normalized = normalizeIconOverrideConfig(config);
    if (normalized) {
      result[itemId.trim()] = normalized;
    }
  }
  return result;
}

export function normalizeIconOverrideConfig(value: unknown): IconOverrideConfig | null {
  if (!isRecord(value)) {
    return null;
  }
  const type = value.type === "emoji" || value.type === "lucide" ? value.type : null;
  const rawValue = typeof value.value === "string" ? value.value.trim() : "";
  if (!type || !rawValue || isUnsafeIconValue(rawValue)) {
    return null;
  }
  return {
    type,
    value: type === "lucide" ? rawValue.toLowerCase() : rawValue.slice(0, 16)
  };
}

export function getIconOverride(overrides: IconOverrides | undefined, itemId: string | undefined, fallbackIcon: string): IconOverrideConfig {
  if (itemId) {
    const override = overrides?.[itemId];
    if (override) {
      return override;
    }
  }
  return { type: "lucide", value: fallbackIcon };
}

export function renderConfigurableIcon(container: HTMLElement, iconConfig: IconOverrideConfig, fallbackIcon: string): void {
  container.textContent = "";
  container.removeClass("memos-plus-emoji-icon", "memos-plus-lucide-icon");
  if (iconConfig.type === "emoji") {
    container.addClass("memos-plus-emoji-icon");
    container.createSpan({ text: iconConfig.value });
    return;
  }
  container.addClass("memos-plus-lucide-icon");
  renderLucideIcon(container, iconConfig.value, fallbackIcon);
}

export function iconOverrideIdForOrganizerFilter(filterId: OrganizerFilterId): string {
  return ORGANIZER_ICON_OVERRIDE_IDS[filterId];
}

export function sidebarItemIconOverrideId(itemId: string): string {
  return `sidebar:${itemId}`;
}

function renderLucideIcon(container: HTMLElement, iconName: string, fallbackIcon: string): void {
  const safeIcon = isKnownLucideIcon(iconName) ? iconName : fallbackIcon;
  try {
    Obsidian.setIcon?.(container, safeIcon as IconName);
  } catch {
    if (safeIcon !== fallbackIcon) {
      renderLucideIcon(container, fallbackIcon, fallbackIcon);
    }
  }
}

function isKnownLucideIcon(iconName: string): boolean {
  try {
    const ids = Obsidian.getIconIds?.() ?? [];
    return ids.length === 0 || ids.includes(iconName);
  } catch {
    return true;
  }
}

function isUnsafeIconValue(value: string): boolean {
  return /[<>]/.test(value) || /^(?:https?:|data:|file:)/i.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
