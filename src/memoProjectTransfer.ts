export type MemoProjectTransferAfterAction = "keep" | "archive" | "delete";
export type MemoProjectTransferOutcome = "kept" | "archived" | "deleted";

export interface MemoProjectTransferHandlers {
  archive: () => Promise<void>;
  delete: () => Promise<void>;
  confirmDelete: () => boolean;
}

export function normalizeMemoProjectTransferAfterAction(value: unknown): MemoProjectTransferAfterAction {
  return value === "archive" || value === "delete" ? value : "keep";
}

export async function applyMemoProjectTransferAfterAction(
  action: MemoProjectTransferAfterAction,
  isArchived: boolean,
  handlers: MemoProjectTransferHandlers
): Promise<MemoProjectTransferOutcome> {
  if (action === "archive") {
    if (!isArchived) {
      await handlers.archive();
    }
    return "archived";
  }
  if (action === "delete") {
    if (!handlers.confirmDelete()) {
      return "kept";
    }
    await handlers.delete();
    return "deleted";
  }
  return "kept";
}
