import type { MemoItem } from "./markdown";

export type MemoViewMode = "all" | "today" | "week" | "todo" | "pinned" | "starred" | "archived" | "review" | "untagged" | "images" | "links";
export type SortOrder = "newest" | "oldest";

export interface MemoFilterOptions {
  view: MemoViewMode;
  today: string;
  query?: string;
  tag?: string;
  year?: string;
  showArchived?: boolean;
  sortOrder?: SortOrder;
}

export function filterMemos(memos: MemoItem[], options: MemoFilterOptions): MemoItem[] {
  const query = options.query?.trim().toLowerCase() ?? "";
  const weekStart = startOfWeek(options.today);
  const weekEnd = addDays(weekStart, 6);

  return memos
    .filter((memo) => {
      if (options.view !== "archived" && !options.showArchived && memo.isArchived) {
        return false;
      }
      if (options.year && memo.date.slice(0, 4) !== options.year) {
        return false;
      }
      if (options.view === "today" && memo.date !== options.today) {
        return false;
      }
      if (options.view === "week" && (memo.date < weekStart || memo.date > weekEnd)) {
        return false;
      }
      if (options.view === "todo" && !memo.hasOpenTask) {
        return false;
      }
      if (options.view === "pinned" && !memo.isPinned) {
        return false;
      }
      if (options.view === "starred" && !memo.isStarred) {
        return false;
      }
      if (options.view === "archived" && !memo.isArchived) {
        return false;
      }
      if (options.view === "review" && memo.date.slice(5) !== options.today.slice(5)) {
        return false;
      }
      if (options.view === "untagged" && memo.tags.length > 0) {
        return false;
      }
      if (options.view === "images" && !memo.hasImage) {
        return false;
      }
      if (options.view === "links" && !memo.hasLink) {
        return false;
      }
      if (options.tag && !memo.tags.includes(options.tag)) {
        return false;
      }
      if (query && !memo.content.toLowerCase().includes(query) && !memo.date.includes(query) && !memo.time.includes(query)) {
        return false;
      }
      return true;
    })
    .sort((left, right) => {
      const diff = left.datetime.getTime() - right.datetime.getTime();
      return options.sortOrder === "oldest" ? diff : -diff;
    });
}

export function getAllTags(memos: MemoItem[]): string[] {
  return [...new Set(memos.flatMap((memo) => memo.tags))].sort((left, right) => left.localeCompare(right));
}

export function todayString(now = new Date()): string {
  return formatDate(now);
}

export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatTime(date: Date): string {
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${hour}:${minute}`;
}

function startOfWeek(dateString: string): string {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const diff = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - diff);
  return formatDate(date);
}

function addDays(dateString: string, days: number): string {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return formatDate(date);
}
