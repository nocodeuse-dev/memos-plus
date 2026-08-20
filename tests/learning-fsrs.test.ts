import { describe, expect, it } from "vitest";
import { createFsrsState, scheduleFsrsReview } from "../src/learning/fsrs";

const NOW = new Date("2026-08-20T09:00:00.000Z");

describe("lightweight FSRS scheduler", () => {
  it("starts a new card due immediately without inventing a fixed interval", () => {
    const card = createFsrsState(NOW);
    expect(card).toMatchObject({ state: "new", stability: 0, difficulty: 5, reps: 0, dueAt: NOW.toISOString() });
  });

  it("uses the rating to create distinct first-review states and intervals", () => {
    const again = scheduleFsrsReview(createFsrsState(NOW), "again", NOW);
    const hard = scheduleFsrsReview(createFsrsState(NOW), "hard", NOW);
    const good = scheduleFsrsReview(createFsrsState(NOW), "good", NOW);
    const easy = scheduleFsrsReview(createFsrsState(NOW), "easy", NOW);

    expect(again).toMatchObject({ state: "learning", reps: 1, lapses: 1 });
    expect(hard).toMatchObject({ state: "learning", reps: 1 });
    expect(good).toMatchObject({ state: "review", reps: 1 });
    expect(easy).toMatchObject({ state: "review", reps: 1 });
    expect(again.dueAt < hard.dueAt).toBe(true);
    expect(hard.dueAt < good.dueAt).toBe(true);
    expect(good.dueAt < easy.dueAt).toBe(true);
  });

  it("adapts a review interval using prior stability, elapsed time and rating", () => {
    const reviewed = scheduleFsrsReview(createFsrsState(NOW), "good", NOW);
    const onTime = scheduleFsrsReview(reviewed, "good", new Date(reviewed.dueAt));
    const late = scheduleFsrsReview(reviewed, "good", new Date(new Date(reviewed.dueAt).getTime() + 14 * 24 * 60 * 60_000));
    const forgotten = scheduleFsrsReview(onTime, "again", new Date(onTime.dueAt));

    expect(onTime.state).toBe("review");
    expect(onTime.stability).toBeGreaterThan(reviewed.stability);
    expect(late.stability).toBeGreaterThan(onTime.stability);
    expect(forgotten).toMatchObject({ state: "relearning", lapses: 1 });
    expect(forgotten.dueAt < onTime.dueAt).toBe(false);
    expect(forgotten.stability).toBeLessThan(onTime.stability);
  });
});
