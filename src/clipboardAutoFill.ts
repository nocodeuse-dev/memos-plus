export const DEFAULT_CLIPBOARD_AUTO_FILL_THROTTLE_MS = 1200;
export const CLIPBOARD_AUTO_FILL_STATE_LIMIT = 24;
export const AUTO_CLIPBOARD_SOURCE = "autoClipboard";

export type ClipboardAutoFillContext = "main" | "sidebar" | "mobile" | "quickCapture";

export type ClipboardAutoFillAction = "auto-filled" | "dismissed";

export interface ClipboardAutoFillRecord {
  fingerprint: string;
  length: number;
  context: ClipboardAutoFillContext | "global";
  action: ClipboardAutoFillAction;
  source: string;
  at: number;
}

export interface ClipboardAutoFillState {
  history: ClipboardAutoFillRecord[];
  lastCheckAt: number;
}

export const DEFAULT_CLIPBOARD_AUTO_FILL_STATE: Readonly<ClipboardAutoFillState> = {
  history: [],
  lastCheckAt: 0
};

export function normalizeClipboardAutoFillState(raw: unknown): ClipboardAutoFillState {
  const fallback = { ...DEFAULT_CLIPBOARD_AUTO_FILL_STATE } as ClipboardAutoFillState;
  if (!raw || typeof raw !== "object") {
    return fallback;
  }
  const history = normalizeClipboardAutoFillHistory((raw as { history?: unknown }).history);
  const lastCheckAt = typeof (raw as { lastCheckAt?: unknown }).lastCheckAt === "number" && Number.isFinite((raw as { lastCheckAt: number }).lastCheckAt)
    ? (raw as { lastCheckAt: number }).lastCheckAt
    : 0;
  return { history, lastCheckAt };
}

export function normalizeClipboardAutoFillHistory(raw: unknown): ClipboardAutoFillRecord[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const now = Date.now();
  const valid = raw
    .flatMap((value) => {
      if (!value || typeof value !== "object") {
        return [];
      }
      const record = value as Partial<ClipboardAutoFillRecord>;
      if (typeof record.fingerprint !== "string" || typeof record.length !== "number") {
        return [];
      }
      const action = record.action;
      if (action !== "auto-filled" && action !== "dismissed") {
        return [];
      }
      if (record.context !== "main" && record.context !== "sidebar" && record.context !== "mobile" && record.context !== "quickCapture" && record.context !== "global") {
        return [];
      }
      if (typeof record.at !== "number" || !Number.isFinite(record.at)) {
        return [];
      }
      return [{
        fingerprint: record.fingerprint,
        length: record.length,
        context: record.context,
        action,
        source: AUTO_CLIPBOARD_SOURCE,
        at: Math.min(Math.max(record.at, 0), now)
      }];
    })
    .sort((a, b) => b.at - a.at);
  return pruneClipboardAutoFillHistory(valid);
}

export function getClipboardFingerprint(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export interface ClipboardAutoFillCheckOptions {
  context: ClipboardAutoFillContext;
  state?: ClipboardAutoFillState;
  now?: number;
  throttleMs?: number;
}

export function shouldAutoApplyClipboard(text: string, options: ClipboardAutoFillCheckOptions): boolean {
  const normalizedText = text.trim();
  if (!normalizedText) {
    return false;
  }
  const now = options.now ?? Date.now();
  const throttleMs = options.throttleMs ?? DEFAULT_CLIPBOARD_AUTO_FILL_THROTTLE_MS;
  if (!options.state) {
    return true;
  }
  if (now - options.state.lastCheckAt < throttleMs) {
    options.state.lastCheckAt = now;
    return false;
  }
  options.state.lastCheckAt = now;

  const fingerprint = getClipboardFingerprint(normalizedText);
  const length = normalizedText.length;
  const matched = options.state.history.find((entry) => entry.fingerprint === fingerprint && entry.length === length);
  if (!matched) {
    return true;
  }
  return false;
}

export interface ClipboardAutoFillMarkOptions extends ClipboardAutoFillCheckOptions {
  source: typeof AUTO_CLIPBOARD_SOURCE;
  state: ClipboardAutoFillState;
}

export function markClipboardAutoApplied(
  text: string,
  options: ClipboardAutoFillMarkOptions
): boolean {
  const normalizedText = text.trim();
  if (!normalizedText) {
    return false;
  }
  return upsertClipboardAutoFillRecord(
    normalizedText,
    options.context,
    "auto-filled",
    options.state,
    options.now ?? Date.now(),
    options.source
  );
}

export function markClipboardDismissed(
  text: string,
  options: ClipboardAutoFillMarkOptions
): boolean {
  const normalizedText = text.trim();
  if (!normalizedText) {
    return false;
  }
  return upsertClipboardAutoFillRecord(
    normalizedText,
    options.context,
    "dismissed",
    options.state,
    options.now ?? Date.now(),
    options.source
  );
}

export function wasClipboardContentAutoApplied(text: string, state?: ClipboardAutoFillState): boolean {
  if (!state) {
    return false;
  }
  const normalizedText = text.trim();
  if (!normalizedText) {
    return false;
  }
  const fingerprint = getClipboardFingerprint(normalizedText);
  const length = normalizedText.length;
  return state.history.some((entry) => entry.fingerprint === fingerprint && entry.length === length && entry.action === "auto-filled");
}

export function pruneClipboardAutoFillHistory(entries: ClipboardAutoFillRecord[]): ClipboardAutoFillRecord[] {
  return entries
    .filter((entry, index, list) => {
      const hasDuplicateBefore = list.slice(0, index).some((previous) => previous.fingerprint === entry.fingerprint && previous.length === entry.length);
      return !hasDuplicateBefore;
    })
    .slice(0, CLIPBOARD_AUTO_FILL_STATE_LIMIT);
}

function upsertClipboardAutoFillRecord(
  text: string,
  context: ClipboardAutoFillContext,
  action: ClipboardAutoFillAction,
  state: ClipboardAutoFillState,
  now: number,
  source: typeof AUTO_CLIPBOARD_SOURCE
): boolean {
  const normalizedText = text.trim();
  if (!normalizedText) {
    return false;
  }
  const fingerprint = getClipboardFingerprint(normalizedText);
  const length = normalizedText.length;
  const previousEntries = state.history;
  const nextEntries = previousEntries.filter((entry) => !(entry.fingerprint === fingerprint && entry.length === length && entry.action === action));
  nextEntries.unshift({
    fingerprint,
    length,
    context,
    action,
    at: now,
    source
  });
  state.history = pruneClipboardAutoFillHistory(nextEntries);
  return true;
}
