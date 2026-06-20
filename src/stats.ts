import type { MemoItem } from "./markdown";

export interface MemoStats {
  total: number;
  tags: number;
  activeDays: number;
  today: number;
  openTasks: number;
  untagged: number;
  withImages: number;
  withLinks: number;
}

export interface YearCount {
  year: string;
  count: number;
}

export function computeMemoStats(memos: MemoItem[], today: string): MemoStats {
  return {
    total: memos.length,
    tags: new Set(memos.flatMap((memo) => memo.tags)).size,
    activeDays: new Set(memos.map((memo) => memo.date)).size,
    today: memos.filter((memo) => memo.date === today).length,
    openTasks: memos.filter((memo) => memo.hasOpenTask).length,
    untagged: memos.filter((memo) => memo.tags.length === 0).length,
    withImages: memos.filter((memo) => memo.hasImage).length,
    withLinks: memos.filter((memo) => memo.hasLink).length
  };
}

export function countByYear(memos: MemoItem[]): YearCount[] {
  const counts = new Map<string, number>();
  for (const memo of memos) {
    const year = memo.date.slice(0, 4);
    counts.set(year, (counts.get(year) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([year, count]) => ({ year, count }))
    .sort((left, right) => right.year.localeCompare(left.year));
}
