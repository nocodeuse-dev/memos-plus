import { describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => ({
  TFile: class TFile {},
  App: class App {}
}));

import {
  createLearningCard,
  hasLearningTag,
  isMastered,
  learningCardStats,
  learningCardsForFilter,
  needsStrengthening,
  normalizeLearningCards,
  resolveLearningCardContent,
  scheduleLearningCard
} from "../src/learning/learningCards";
import { LearningCardService } from "../src/learning/learningCardService";
import type { App } from "obsidian";

const NOW = new Date("2026-08-20T09:00:00.000Z");

describe("learning cards", () => {
  it("recognizes a standalone learning tag without treating ordinary text as a card", () => {
    expect(hasLearningTag("半月板撕裂 #学习")).toBe(true);
    expect(hasLearningTag("半月板撕裂 #学习/骨科")).toBe(false);
    expect(hasLearningTag("学习资料")).toBe(false);
    expect(hasLearningTag("#学习计划")).toBe(false);
  });

  it("keeps a small card state object linked to its Markdown file and heading", () => {
    const card = createLearningCard({
      filePath: "/我的资源/笔记库/半月板.md",
      heading: "半月板撕裂",
      content: "内侧半月板撕裂如何判断？ #学习"
    }, NOW);

    expect(card).toMatchObject({
      sourceFile: "我的资源/笔记库/半月板.md",
      sourceHeading: "半月板撕裂",
      state: "new",
      dueAt: NOW.toISOString()
    });
    expect(card.snapshotContent).toContain("#学习");
    expect(card.sourceAnchor).toContain("内侧半月板撕裂");
  });

  it("classifies cards from their scheduling state rather than a saved category", () => {
    const fresh = createLearningCard({ filePath: "学习.md", content: "新卡 #学习" }, NOW);
    const mastered = {
      ...fresh,
      id: "mastered",
      state: "review" as const,
      stability: 30,
      difficulty: 4,
      reps: 8,
      lapses: 1,
      dueAt: "2026-09-20T09:00:00.000Z"
    };
    const strengthen = {
      ...fresh,
      id: "strengthen",
      state: "relearning" as const,
      stability: 1,
      difficulty: 8,
      reps: 3,
      lapses: 2,
      dueAt: "2026-08-19T09:00:00.000Z",
      lastRating: "again" as const
    };
    const cards = [fresh, mastered, strengthen];

    expect(learningCardsForFilter(cards, "today", NOW).map((card) => card.id)).toEqual(["strengthen", fresh.id]);
    expect(learningCardsForFilter(cards, "due", NOW).map((card) => card.id)).toEqual(["strengthen"]);
    expect(learningCardsForFilter(cards, "learning", NOW).map((card) => card.id)).toEqual(["strengthen", fresh.id]);
    expect(isMastered(mastered)).toBe(true);
    expect(needsStrengthening(strengthen)).toBe(true);
    expect(learningCardStats(cards, NOW)).toMatchObject({ today: 2, newCards: 1, overdue: 1, mastered: 1 });
  });

  it("changes scheduling state immediately after a review", () => {
    const fresh = createLearningCard({ filePath: "学习.md", content: "新卡 #学习" }, NOW);
    const next = scheduleLearningCard(fresh, "good", NOW);
    expect(next).toMatchObject({ state: "review", reps: 1, lastRating: "good" });
    expect(next.dueAt > NOW.toISOString()).toBe(true);
  });

  it("normalizes malformed persisted cards and keeps a snapshot if the source no longer exists", async () => {
    const cards = normalizeLearningCards([{ id: "one", sourceFile: "/学习.md", snapshotContent: "保存的答案", dueAt: "invalid", state: "unknown" }]);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ sourceFile: "学习.md", state: "new", snapshotContent: "保存的答案" });
    const content = await resolveLearningCardContent({ vault: { getAbstractFileByPath: () => null } } as unknown as App, cards[0]);
    expect(content).toEqual({ content: "保存的答案", sourceMissing: true });
  });

  it("does not create duplicate cards when a successful collection write is retried", async () => {
    let persisted = [] as ReturnType<typeof normalizeLearningCards>;
    const service = new LearningCardService({} as App, () => persisted, async (cards) => { persisted = cards; });
    const source = { filePath: "我的资源/Memos/2026.md", heading: "2026-08-20", content: "复习半月板 #学习" };

    expect(await service.createFromCollectedContent(source)).not.toBeNull();
    expect(await service.createFromCollectedContent(source)).toBeNull();
    expect(persisted).toHaveLength(1);
  });
});
