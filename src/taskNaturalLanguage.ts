import type { TaskPriority } from "./tasksFormat";

export interface ParsedNaturalLanguageTask {
  original: string;
  title: string;
  date: string;
  time: string;
  reminderMinutesBefore?: number;
  tags: string[];
  priority: TaskPriority;
  matched: boolean;
}

const WEEKDAYS: Record<string, number> = {
  日: 0,
  天: 0,
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6
};

export function parseNaturalLanguageTask(input: string, now = new Date()): ParsedNaturalLanguageTask {
  const original = input.trim();
  let working = original;
  let matched = false;
  let date = "";
  let time = "";
  let reminderMinutesBefore: number | undefined;
  let priority: TaskPriority = "none";

  const relativeDate = working.match(/(?:^|\s|[，,。；;])((?:今天|明天|后天))(?=$|\s|[，,。；;]|(?:上午|下午|晚上|\d))/u);
  if (relativeDate) {
    const offset = relativeDate[1] === "明天" ? 1 : relativeDate[1] === "后天" ? 2 : 0;
    date = formatLocalDate(addDays(startOfLocalDay(now), offset));
    working = removeMatch(working, relativeDate);
    matched = true;
  } else {
    const weekday = working.match(/(?:^|\s|[，,。；;])(?:周|星期)([一二三四五六日天])(?=$|\s|[，,。；;]|(?:上午|下午|晚上|\d))/u);
    if (weekday) {
      date = formatLocalDate(nextWeekday(startOfLocalDay(now), WEEKDAYS[weekday[1]]));
      working = removeMatch(working, weekday);
      matched = true;
    }
  }

  const timeMatch = working.match(/(?:^|\s|[，,。；;])(?:(上午|下午|晚上)\s*)?(\d{1,2})(?:点半|[:：点时](\d{1,2})?分?)(?=$|\s|[，,。；;]|\p{Script=Han})/u);
  if (timeMatch) {
    const period = timeMatch[1] ?? "";
    let hour = Number(timeMatch[2]);
    const minute = timeMatch[0].includes("点半") ? 30 : Number(timeMatch[3] ?? 0);
    if (period === "下午" || period === "晚上") {
      if (hour < 12) hour += 12;
    } else if (period === "上午" && hour === 12) {
      hour = 0;
    }
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      working = removeMatch(working, timeMatch);
      matched = true;
    }
  }

  const reminder = working.match(/提前\s*(\d+)\s*(分钟|小时)\s*提醒/u);
  if (reminder) {
    const amount = Number(reminder[1]);
    reminderMinutesBefore = Math.min(10080, amount * (reminder[2] === "小时" ? 60 : 1));
    working = removeMatch(working, reminder);
    matched = true;
  }

  const tags = unique(working.match(/#[^\s#，,。；;!！]+/gu) ?? []);
  if (tags.length > 0) {
    working = working.replace(/#[^\s#，,。；;!！]+/gu, " ");
    matched = true;
  }

  const priorityMatch = working.match(/(?:^|\s|[，,。；;])![低中高](?=$|\s|[，,。；;])/u);
  if (priorityMatch) {
    const marker = priorityMatch[0].match(/![低中高]/u)?.[0] ?? "";
    priority = marker === "!高" ? "high" : marker === "!低" ? "low" : "medium";
    working = removeMatch(working, priorityMatch);
    matched = true;
  }

  const title = working
    .replace(/[，,。；;]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();

  return {
    original,
    title: title || original,
    date,
    time,
    reminderMinutesBefore,
    tags,
    priority,
    matched: matched && Boolean(title)
  };
}

function removeMatch(value: string, match: RegExpMatchArray): string {
  const start = match.index ?? value.indexOf(match[0]);
  if (start < 0) return value;
  const leading = match[0].match(/^[\s，,。；;]+/u)?.[0] ?? "";
  return `${value.slice(0, start)}${leading ? " " : ""}${value.slice(start + match[0].length)}`;
}

function startOfLocalDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12, 0, 0, 0);
}

function addDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function nextWeekday(value: Date, weekday: number): Date {
  const offset = (weekday - value.getDay() + 7) % 7;
  return addDays(value, offset);
}

function formatLocalDate(value: Date): string {
  return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, "0"), String(value.getDate()).padStart(2, "0")].join("-");
}

function unique(values: string[]): string[] {
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.startsWith("#") ? value : `#${value}`;
    if (!result.includes(normalized)) result.push(normalized);
  }
  return result;
}
