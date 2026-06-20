import { describe, expect, it, vi } from "vitest";
import { applyMemoProjectTransferAfterAction } from "../src/memoProjectTransfer";

function createHandlers(confirmDelete = true) {
  return {
    archive: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
    confirmDelete: vi.fn(() => confirmDelete)
  };
}

describe("applyMemoProjectTransferAfterAction", () => {
  it("keeps the original memo without changing it", async () => {
    const handlers = createHandlers();

    await expect(applyMemoProjectTransferAfterAction("keep", false, handlers)).resolves.toBe("kept");
    expect(handlers.archive).not.toHaveBeenCalled();
    expect(handlers.delete).not.toHaveBeenCalled();
    expect(handlers.confirmDelete).not.toHaveBeenCalled();
  });

  it("archives an unarchived memo and leaves an archived memo unchanged", async () => {
    const handlers = createHandlers();
    await expect(applyMemoProjectTransferAfterAction("archive", false, handlers)).resolves.toBe("archived");
    expect(handlers.archive).toHaveBeenCalledOnce();

    const archivedHandlers = createHandlers();
    await expect(applyMemoProjectTransferAfterAction("archive", true, archivedHandlers)).resolves.toBe("archived");
    expect(archivedHandlers.archive).not.toHaveBeenCalled();
  });

  it("deletes the original memo after confirmation", async () => {
    const handlers = createHandlers(true);

    await expect(applyMemoProjectTransferAfterAction("delete", false, handlers)).resolves.toBe("deleted");
    expect(handlers.confirmDelete).toHaveBeenCalledOnce();
    expect(handlers.delete).toHaveBeenCalledOnce();
  });

  it("keeps the original memo when delete confirmation is cancelled", async () => {
    const handlers = createHandlers(false);

    await expect(applyMemoProjectTransferAfterAction("delete", false, handlers)).resolves.toBe("kept");
    expect(handlers.confirmDelete).toHaveBeenCalledOnce();
    expect(handlers.delete).not.toHaveBeenCalled();
  });
});
