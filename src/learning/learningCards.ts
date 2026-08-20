import { TFile, type App } from "obsidian";
import { createFsrsState, scheduleFsrsReview, type FsrsCardState, type FsrsRating } from "./fsrs";

export type LearningCardFilter = "today" | "due" | "learning" | "strengthen" | "mastered" | "all";

export interface LearningCard {
  id: string;
  sourceFile: string;
  sourceHeading: string;
  sourceAnchor: string;
  snapshotContent: string;
  createdAt: string;
  lastReviewAt: string;
  dueAt: string;
  reps: number;
  lapses: number;
  stability: number;
  difficulty: number;
  state: FsrsCardState;
  lastRating: FsrsRating | "";
}

export interface LearningCardSource {
  filePath: string;
  heading?: string;
  content: string;
}

export interface LearningCardContent {
  content: string;
  sourceMissing: boolean;
}

export interface LearningCardStats {
  today: number;
  newCards: number;
  overdue: number;
  mastered: number;
}

const MAX_SNAPSHOT_LENGTH = 16_000;

export function hasLearningTag(content: string): boolean {
  return /(^|\s)#学习(?=$|\s|[，,。；;:：!?！？)）\]】])/u.test(content);
}

export function createLearningCard(source: LearningCardSource, now = new Date()): LearningCard {
  const initial = createFsrsState(now);
  const content = source.content.trim();
  return {
    id: learningCardId(source.filePath, source.heading ?? "", content),
    sourceFile: normalizePath(source.filePath),
    sourceHeading: source.heading?.trim() ?? "",
    sourceAnchor: compactAnchor(content),
    snapshotContent: content.slice(0, MAX_SNAPSHOT_LENGTH),
    createdAt: now.toISOString(),
    lastReviewAt: initial.lastReviewAt,
    dueAt: initial.dueAt,
    reps: initial.reps,
    lapses: initial.lapses,
    stability: initial.stability,
    difficulty: initial.difficulty,
    state: initial.state,
    lastRating: ""
  };
}

export function normalizeLearningCards(value: unknown): LearningCard[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const cards: LearningCard[] = [];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") continue;
    const raw = candidate as Record<string, unknown>;
    const sourceFile = normalizePath(raw.sourceFile);
    const id = text(raw.id) || learningCardId(sourceFile, text(raw.sourceHeading), text(raw.snapshotContent));
    if (!id || !sourceFile || seen.has(id)) continue;
    seen.add(id);
    const state = normalizeState(raw.state);
    cards.push({
      id,
      sourceFile,
      sourceHeading: text(raw.sourceHeading),
      sourceAnchor: text(raw.sourceAnchor),
      snapshotContent: text(raw.snapshotContent).slice(0, MAX_SNAPSHOT_LENGTH),
      createdAt: validIso(raw.createdAt),
      lastReviewAt: validIso(raw.lastReviewAt),
      dueAt: validIso(raw.dueAt) || new Date().toISOString(),
      reps: nonNegativeInteger(raw.reps),
      lapses: nonNegativeInteger(raw.lapses),
      stability: clampNumber(raw.stability, 0, 36_500, state === "new" ? 0 : 1),
      difficulty: clampNumber(raw.difficulty, 1, 10, 5),
      state,
      lastRating: normalizeRating(raw.lastRating)
    });
    if (cards.length >= 10_000) break;
  }
  return cards;
}

export function scheduleLearningCard(card: LearningCard, rating: FsrsRating, now = new Date()): LearningCard {
  const next = scheduleFsrsReview(card, rating, now);
  return {
    ...card,
    ...next,
    lastRating: rating
  };
}

export function learningCardsForFilter(cards: LearningCard[], filter: LearningCardFilter, now = new Date()): LearningCard[] {
  const start = startOfDay(now).getTime();
  const end = start + 24 * 60 * 60_000;
  const dueAt = (card: LearningCard): number => timestamp(card.dueAt);
  const filtered = cards.filter((card) => {
    if (filter === "all") return true;
    if (filter === "today") return dueAt(card) <= end && !isMastered(card);
    if (filter === "due") return dueAt(card) < start && !isMastered(card);
    if (filter === "learning") return card.state === "new" || card.state === "learning" || card.state === "relearning";
    if (filter === "strengthen") return needsStrengthening(card);
    return isMastered(card);
  });
  return [...filtered].sort((left, right) => dueAt(left) - dueAt(right) || left.createdAt.localeCompare(right.createdAt));
}

export function learningCardStats(cards: LearningCard[], now = new Date()): LearningCardStats {
  const start = startOfDay(now).getTime();
  const end = start + 24 * 60 * 60_000;
  return {
    today: cards.filter((card) => timestamp(card.dueAt) <= end && !isMastered(card)).length,
    newCards: cards.filter((card) => card.state === "new").length,
    overdue: cards.filter((card) => timestamp(card.dueAt) < start && !isMastered(card)).length,
    mastered: cards.filter(isMastered).length
  };
}

export function isMastered(card: LearningCard): boolean {
  return card.state === "review" && card.stability >= 21 && card.difficulty <= 5.5 && card.lapses <= Math.max(1, Math.floor(card.reps / 4));
}

export function needsStrengthening(card: LearningCard): boolean {
  return !isMastered(card) && (card.state === "relearning" || card.lastRating === "again" || card.difficulty >= 7 || card.lapses >= Math.max(2, Math.ceil(card.reps / 3)));
}

export async function resolveLearningCardContent(app: App, card: LearningCard): Promise<LearningCardContent> {
  const abstract = app.vault.getAbstractFileByPath(card.sourceFile);
  if (!(abstract instanceof TFile)) return { content: card.snapshotContent, sourceMissing: true };
  try {
    const source = await app.vault.cachedRead(abstract);
    const resolved = extractCurrentSource(source, card);
    return { content: resolved || card.snapshotContent, sourceMissing: false };
  } catch {
    return { content: card.snapshotContent, sourceMissing: true };
  }
}

function extractCurrentSource(source: string, card: LearningCard): string {
  const anchor = card.sourceAnchor.trim();
  if (anchor) {
    const found = source.indexOf(anchor);
    if (found >= 0) return extractMarkdownBlock(source, found) || anchor;
  }
  if (!card.sourceHeading) return "";
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const headingIndex = lines.findIndex((line) => line.replace(/^#+\s*/u, "").trim() === card.sourceHeading);
  if (headingIndex < 0) return "";
  const level = lines[headingIndex].match(/^(#+)\s/u)?.[1].length ?? 6;
  let end = lines.length;
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const nextLevel = lines[index].match(/^(#+)\s/u)?.[1].length;
    if (nextLevel && nextLevel <= level) {
      end = index;
      break;
    }
  }
  return lines.slice(headingIndex, end).join("\n").trim();
}

function extractMarkdownBlock(source: string, start: number): string {
  const before = source.slice(0, start);
  const lineStart = before.lastIndexOf("\n") + 1;
  const after = source.slice(start);
  const nextBlank = after.search(/\n\s*\n/u);
  return source.slice(lineStart, nextBlank < 0 ? source.length : start + nextBlank).trim();
}

function learningCardId(filePath: string, heading: string, content: string): string {
  return `learn-${hash(`${normalizePath(filePath)}\u0001${heading.trim()}\u0001${compactAnchor(content)}`)}`;
}

function compactAnchor(content: string): string {
  return content.replace(/\s+/gu, " ").trim().slice(0, 512);
}

function hash(value: string): string {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

function normalizePath(value: unknown): string {
  return text(value).replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/");
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function validIso(value: unknown): string {
  const result = text(value);
  return Number.isNaN(new Date(result).getTime()) ? "" : result;
}

function nonNegativeInteger(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

function clampNumber(value: unknown, minimum: number, maximum: number, fallback: number): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

function normalizeState(value: unknown): FsrsCardState {
  return value === "learning" || value === "review" || value === "relearning" ? value : "new";
}

function normalizeRating(value: unknown): FsrsRating | "" {
  return value === "again" || value === "hard" || value === "good" || value === "easy" ? value : "";
}

function timestamp(value: string): number {
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 0, 0, 0, 0);
}
