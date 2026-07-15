import { describe, expect, it } from "vitest";
import { SerialTaskQueue } from "../src/serialTaskQueue";

describe("SerialTaskQueue", () => {
  it("runs asynchronous work in submission order", async () => {
    const queue = new SerialTaskQueue();
    const events: string[] = [];
    let releaseFirst!: () => void;
    const firstBlocked = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = queue.run(async () => {
      events.push("first:start");
      await firstBlocked;
      events.push("first:end");
      return 1;
    });
    const second = queue.run(async () => {
      events.push("second");
      return 2;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(events).toEqual(["first:start"]);
    releaseFirst();

    await expect(Promise.all([first, second])).resolves.toEqual([1, 2]);
    expect(events).toEqual(["first:start", "first:end", "second"]);
  });

  it("continues processing after a rejected task", async () => {
    const queue = new SerialTaskQueue();
    const first = queue.run(async () => {
      throw new Error("failed");
    });
    const second = queue.run(async () => "recovered");

    await expect(first).rejects.toThrow("failed");
    await expect(second).resolves.toBe("recovered");
  });
});
