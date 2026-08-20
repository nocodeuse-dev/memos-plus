import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync("main.ts", "utf8");
const composerActions = readFileSync("src/composerActions.ts", "utf8");
const projectDelivery = readFileSync("src/projectDelivery.ts", "utf8");
const calendarView = readFileSync("src/taskCalendarView.ts", "utf8");
const styles = readFileSync("styles.css", "utf8");

describe("learning card integration boundaries", () => {
  it("keeps FSRS scheduling, card state, and focused review outside the task and Apple sync layers", () => {
    expect(readFileSync("src/learning/fsrs.ts", "utf8")).toContain("scheduleFsrsReview");
    expect(readFileSync("src/learning/learningCards.ts", "utf8")).toContain("resolveLearningCardContent");
    expect(readFileSync("src/learning/learningReviewModal.ts", "utf8")).toContain("ratingLabels");
    expect(readFileSync("src/learning/learningCardService.ts", "utf8")).not.toContain("AppleSyncService");
    expect(readFileSync("src/learning/fsrs.ts", "utf8")).not.toContain("TaskIndex");
  });

  it("creates source-linked cards after existing Markdown capture paths without replacing the send flow", () => {
    expect(mainSource).toContain("async onContentWritten");
    expect(mainSource).toContain("this.learningCards.createFromCollectedContent");
    expect(composerActions).toContain("await host.store.addMemo");
    expect(composerActions).toContain("await host.onContentWritten?.(memoFile, rawContent");
    expect(projectDelivery).toContain("await host.store.sendToFileTarget");
    expect(projectDelivery).toContain("await host.onContentWritten?.(choice.file, content, choice.fileTarget.heading)");
  });

  it("adds learning filters and a focused start action to the existing schedule-and-tasks view", () => {
    for (const key of ["today", "due", "learning", "strengthen", "mastered", "all"]) {
      expect(calendarView).toContain(`{ id: "${key}"`);
    }
    expect(calendarView).toContain("this.plugin.openTodayLearningReview()");
    expect(calendarView).toContain("renderLearningPane");
    expect(styles).toContain('data-mobile-tab="learning"');
    expect(styles).toContain(".memos-plus-learning-review");
    expect(styles).toContain(".memos-plus-learning-card");
  });
});
