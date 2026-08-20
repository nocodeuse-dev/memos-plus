import type { TaskRecurrence } from "./tasksFormat";

export interface ParsedTaskDateRecurrence {
  date: string;
  dateExpression: string;
  requiresDateConfirmation: boolean;
  time: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  dueTime: string;
  reminderDate: string;
  reminderTime: string;
  reminderMinutesBefore?: number;
  recurrence: TaskRecurrence;
  customRecurrence: string;
  matched: boolean;
  remaining: string;
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

const ENGLISH_WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const CHINESE_NUMBERS: Record<string, number> = { 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const TIME_SOURCE = "(?:(?:上午|下午|晚上|中午|凌晨)\\s*)?\\d{1,2}(?:(?:[:：]\\d{1,2})|(?:点|时)(?:半|\\d{1,2}(?:分)?|)?)";

/**
 * Pure parser shared by every task entry point. It deliberately returns an
 * unresolved expression instead of inventing a day for year/month-only text.
 */
export function parseTaskDateRecurrence(input: string, now = new Date()): ParsedTaskDateRecurrence {
  let working = input.trim();
  const today = startOfLocalDay(now);
  let date = "";
  let dateExpression = "";
  let requiresDateConfirmation = false;
  let time = "";
  let startTime = "";
  let endTime = "";
  let reminderMinutesBefore: number | undefined;
  let recurrence: TaskRecurrence = "none";
  let customRecurrence = "";
  let matched = false;

  const assignDate = (value: Date, expression: string): void => {
    if (date || !isValidDate(value)) return;
    date = formatLocalDate(value);
    dateExpression = expression;
  };
  const markUnresolvedDate = (expression: string): void => {
    if (date || requiresDateConfirmation) return;
    dateExpression = expression;
    requiresDateConfirmation = true;
    matched = true;
  };
  const consume = (pattern: RegExp, apply: (match: RegExpMatchArray) => void): boolean => {
    const match = working.match(pattern);
    if (!match) return false;
    apply(match);
    working = removeMatch(working, match);
    matched = true;
    return true;
  };

  // Specific recurrence forms carry their own date anchor and must be read
  // before generic "every week/month/year" expressions.
  if (!consume(/每(?:周|星期)\s*([一二三四五六日天])/u, (match) => {
    const weekday = WEEKDAYS[match[1]];
    recurrence = "custom";
    customRecurrence = `every week on ${ENGLISH_WEEKDAYS[weekday]}`;
    assignDate(nextWeekday(today, weekday), match[0]);
  }) && !consume(/每(?:个)?月\s*(\d{1,2})\s*(?:日|号)/u, (match) => {
    const day = Number(match[1]);
    recurrence = "custom";
    customRecurrence = `every month on the ${ordinal(day)}`;
    assignDate(nextMonthlyDay(today, day), match[0]);
  }) && !consume(/每年\s*(\d{1,2})月\s*(\d{1,2})\s*(?:日|号)?/u, (match) => {
    const month = Number(match[1]);
    const day = Number(match[2]);
    recurrence = "custom";
    customRecurrence = `every year on ${englishMonth(month)} ${day}`;
    assignDate(nextYearlyDate(today, month, day), match[0]);
  })) {
    consume(/每(?:隔)?\s*(半|[一二三四五六七八九十两]|\d+)?\s*(个)?(天|日|周|星期|月|年)/u, (match) => {
    const amount = amountFrom(match[1]);
    const unit = match[3];
    if (unit === "天" || unit === "日") {
      recurrence = amount === 1 ? "daily" : "custom";
      customRecurrence = amount === 1 ? "" : `every ${amount} days`;
    } else if (unit === "周" || unit === "星期") {
      recurrence = amount === 1 ? "weekly" : "custom";
      customRecurrence = amount === 1 ? "" : `every ${amount} weeks`;
    } else if (unit === "月") {
      recurrence = amount === 1 ? "monthly" : "custom";
      customRecurrence = amount === 1 ? "" : `every ${amount} months`;
    } else {
      recurrence = amount === 1 ? "yearly" : "custom";
      customRecurrence = amount === 1 ? "" : `every ${amount} years`;
    }
    assignDate(today, match[0]);
    });
  }

  // Relative durations are exact because they are calculated from now.
  if (!consume(/半个月后/u, (match) => assignDate(addDays(today, 15), match[0])) &&
      !consume(/半年后/u, (match) => assignDate(addMonths(today, 6), match[0])) &&
      !consume(/(\d+|[一二三四五六七八九十两])\s*(?:个)?小时后/u, (match) => {
      const value = new Date(now.getTime() + amountFrom(match[1]) * 60 * 60_000);
      assignDate(value, match[0]);
      time = formatLocalTime(value);
      startTime = time;
      }) &&
      !consume(/(\d+|[一二三四五六七八九十两])\s*(?:个)?月后/u, (match) => assignDate(addMonths(today, amountFrom(match[1])), match[0])) &&
      !consume(/(\d+|[一二三四五六七八九十两])\s*(?:周|星期)后/u, (match) => assignDate(addDays(today, amountFrom(match[1]) * 7), match[0]))) {
    consume(/(\d+|[一二三四五六七八九十两])\s*(?:天|日)后/u, (match) => assignDate(addDays(today, amountFrom(match[1])), match[0]));
  }

  // Exact absolute dates. Month/day without a year means the next occurrence.
  if (!consume(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})\s*(?:日|号)?/u, (match) => {
    assignDate(localDate(Number(match[1]), Number(match[2]), Number(match[3])), match[0]);
  }) && !consume(/(今年|明年)\s*(\d{1,2})月\s*(\d{1,2})\s*(?:日|号)?/u, (match) => {
    assignDate(localDate(today.getFullYear() + (match[1] === "明年" ? 1 : 0), Number(match[2]), Number(match[3])), match[0]);
  })) {
    consume(/(\d{1,2})月\s*(\d{1,2})\s*(?:日|号)?/u, (match) => {
    const month = Number(match[1]);
    const day = Number(match[2]);
    let candidate = localDate(today.getFullYear(), month, day);
    if (candidate.getTime() < today.getTime()) candidate = localDate(today.getFullYear() + 1, month, day);
    assignDate(candidate, match[0]);
    });
  }

  if (!consume(/今年年底/u, (match) => assignDate(localDate(today.getFullYear(), 12, 31), match[0])) &&
      !consume(/本周\s*([一二三四五六日天])/u, (match) => assignDate(thisWeekday(today, WEEKDAYS[match[1]]), match[0])) &&
      !consume(/下周\s*([一二三四五六日天])/u, (match) => assignDate(addDays(thisWeekday(today, WEEKDAYS[match[1]]), 7), match[0])) &&
      !consume(/(?:周|星期)\s*([一二三四五六日天])/u, (match) => assignDate(nextWeekday(today, WEEKDAYS[match[1]]), match[0]))) {
    consume(/(?:今天|明天|后天)/u, (match) => {
      const offset = match[0] === "明天" ? 1 : match[0] === "后天" ? 2 : 0;
      assignDate(addDays(today, offset), match[0]);
    });
  }

  // Year/month-only expressions are meaningful, but not a complete date.
  // Keep them in the title and ask the user to choose a day rather than making
  // a hidden first-of-month/first-of-year assumption.
  const unresolved = working.match(/(?:\d{4}年|(?:今年|明年)\s*\d{1,2}月|下周(?=$|\s|[，,。；;]|\p{Script=Han}))/u);
  if (unresolved) markUnresolvedDate(unresolved[0]);

  consume(/提前\s*(半|\d+|[一二三四五六七八九十两])\s*(分钟|分|小时|时)\s*提醒?/u, (match) => {
    const amount = match[1] === "半" ? 30 : amountFrom(match[1]);
    reminderMinutesBefore = Math.min(10080, amount * (match[2] === "小时" || match[2] === "时" ? 60 : 1));
  });

  const rangePattern = new RegExp(`(${TIME_SOURCE})\\s*(?:到|至|[-—–~～])\\s*(${TIME_SOURCE})`, "u");
  consume(rangePattern, (match) => {
    const start = parseClock(match[1]);
    const end = parseClock(match[2], start?.period ?? "");
    if (!start || !end) return;
    startTime = start.value;
    endTime = end.value;
    time = start.value;
  });
  if (!startTime) {
    const deadlinePattern = new RegExp(`(?:截至|截止|最晚)\\s*(${TIME_SOURCE})`, "u");
    const deadline = working.match(deadlinePattern);
    if (deadline) {
      const clock = parseClock(deadline[1]);
      if (clock) {
        time = clock.value;
        startTime = clock.value;
        working = removeMatch(working, deadline);
        matched = true;
      }
    } else {
      const single = working.match(new RegExp(TIME_SOURCE, "u"));
      if (single) {
        const clock = parseClock(single[0]);
        if (clock) {
          time = clock.value;
          startTime = clock.value;
          working = removeMatch(working, single);
          matched = true;
        }
      }
    }
  }

  const dueTime = time || startTime;
  const startDate = date;
  let endDate = date && endTime ? date : "";
  if (date && startTime && endTime && endTime < startTime) endDate = formatLocalDate(addDays(localDateFromString(date), 1));
  let reminderDate = "";
  let reminderTime = "";
  if (reminderMinutesBefore !== undefined && date && dueTime) {
    const reminder = localDateTime(date, dueTime);
    reminder.setMinutes(reminder.getMinutes() - reminderMinutesBefore);
    reminderDate = formatLocalDate(reminder);
    reminderTime = formatLocalTime(reminder);
  }

  if (matched) working = working.replace(/(?:^|\s|[，,。；;])提醒我?/u, " ");
  return {
    date,
    dateExpression,
    requiresDateConfirmation,
    time,
    startDate,
    startTime,
    endDate,
    endTime,
    dueTime,
    reminderDate,
    reminderTime,
    reminderMinutesBefore,
    recurrence,
    customRecurrence,
    matched,
    remaining: normalizeWhitespace(working)
  };
}

function amountFrom(value: string | undefined): number {
  if (!value) return 1;
  if (value === "半") return 0.5;
  return Number(value) || CHINESE_NUMBERS[value] || 1;
}

function parseClock(value: string, inheritedPeriod = ""): { value: string; period: string } | null {
  const match = value.trim().match(/^(上午|下午|晚上|中午|凌晨)?\s*(\d{1,2})(?:(?:[:：](\d{1,2}))|(?:点|时)(半|(\d{1,2})(?:分)?)?)$/u);
  if (!match) return null;
  const period = match[1] || inheritedPeriod;
  let hour = Number(match[2]);
  const minute = match[3] ? Number(match[3]) : match[4] === "半" ? 30 : Number(match[5] ?? 0);
  if (period === "下午" || period === "晚上") {
    if (hour < 12) hour += 12;
  } else if (period === "中午") {
    if (hour < 11) hour += 12;
  } else if ((period === "上午" || period === "凌晨") && hour === 12) {
    hour = 0;
  }
  if (hour > 23 || minute > 59) return null;
  return { value: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`, period };
}

function removeMatch(value: string, match: RegExpMatchArray): string {
  const start = match.index ?? value.indexOf(match[0]);
  if (start < 0) return value;
  return `${value.slice(0, start)} ${value.slice(start + match[0].length)}`;
}

function startOfLocalDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12, 0, 0, 0);
}

function localDate(year: number, month: number, day: number): Date {
  const base = new Date(year, month - 1, 1, 12, 0, 0, 0);
  const candidate = new Date(base.getFullYear(), base.getMonth(), day, 12, 0, 0, 0);
  return candidate.getFullYear() === base.getFullYear() && candidate.getMonth() === base.getMonth() && candidate.getDate() === day ? candidate : new Date(NaN);
}

function localDateFromString(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return localDate(year, month, day);
}

function localDateTime(date: string, time: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function addDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(value: Date, months: number): Date {
  const originalDay = value.getDate();
  const next = new Date(value.getFullYear(), value.getMonth() + months, 1, 12, 0, 0, 0);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(originalDay, lastDay));
  return next;
}

function thisWeekday(value: Date, weekday: number): Date {
  return addDays(value, weekday - value.getDay());
}

function nextWeekday(value: Date, weekday: number): Date {
  return addDays(value, (weekday - value.getDay() + 7) % 7);
}

function nextMonthlyDay(value: Date, day: number): Date {
  let candidate = localDate(value.getFullYear(), value.getMonth() + 1, day);
  if (!isValidDate(candidate) || candidate.getTime() < value.getTime()) candidate = localDate(value.getFullYear(), value.getMonth() + 2, day);
  return candidate;
}

function nextYearlyDate(value: Date, month: number, day: number): Date {
  let candidate = localDate(value.getFullYear(), month, day);
  if (!isValidDate(candidate) || candidate.getTime() < value.getTime()) candidate = localDate(value.getFullYear() + 1, month, day);
  return candidate;
}

function formatLocalDate(value: Date): string {
  return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, "0"), String(value.getDate()).padStart(2, "0")].join("-");
}

function formatLocalTime(value: Date): string {
  return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
}

function isValidDate(value: Date): boolean {
  return Number.isFinite(value.getTime());
}

function normalizeWhitespace(value: string): string {
  return value.replace(/[，,。；;]+/gu, " ").replace(/\s+/gu, " ").trim();
}

function ordinal(value: number): string {
  const suffix = value % 100 >= 11 && value % 100 <= 13 ? "th" : value % 10 === 1 ? "st" : value % 10 === 2 ? "nd" : value % 10 === 3 ? "rd" : "th";
  return `${value}${suffix}`;
}

function englishMonth(month: number): string {
  return ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][month - 1] ?? "January";
}
