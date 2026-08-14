import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createUnifiedTaskDraft } from "../src/unifiedTaskComposerModel";

const taskSettings = {
  enabled: true,
  defaultPriority: "medium" as const,
  defaultDueDate: "",
  defaultScheduledDate: "",
  defaultRecurrence: "none" as const,
  addCreatedDate: true,
  appleSyncEnabled: true,
  appleSyncTag: "#Apple同步",
  defaultSyncTarget: "reminders" as const
};

describe("unified task composer draft", () => {
  it("uses one natural-language mapping for every task entry", () => {
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const expectedDate = [tomorrow.getFullYear(), String(tomorrow.getMonth() + 1).padStart(2, "0"), String(tomorrow.getDate()).padStart(2, "0")].join("-");
    const draft = createUnifiedTaskDraft("明天下午3点复诊张先生，提前30分钟提醒 #门诊 !高", taskSettings);

    expect(draft.content).toBe("复诊张先生 #门诊");
    expect(draft.task).toMatchObject({
      dueDate: expectedDate,
      dueTime: "15:00",
      reminderMinutesBefore: 30,
      priority: "high",
      syncTarget: "reminders",
      syncTag: "#Apple同步"
    });
  });

  it("keeps complex multiline content intact while applying shared defaults", () => {
    const content = "[病例链接](https://example.com)\n\n补充说明";
    const draft = createUnifiedTaskDraft(content, taskSettings, {
      fallbackDueDate: "2026-08-20",
      projectTag: "项目/门诊"
    });

    expect(draft.content).toBe(content);
    expect(draft.task.dueDate).toBe("2026-08-20");
    expect(draft.task.projectTag).toBe("项目/门诊");
  });

  it("lets explicit editor values override parsed defaults without changing normalized content", () => {
    const draft = createUnifiedTaskDraft("明天下午3点复诊 #门诊 !高", taskSettings, {
      task: {
        isTask: true,
        dueDate: "2026-09-01",
        dueTime: "17:30",
        priority: "low"
      }
    });

    expect(draft.content).toBe("复诊 #门诊");
    expect(draft.task).toMatchObject({ dueDate: "2026-09-01", dueTime: "17:30", priority: "low" });
  });
});

describe("unified task composer integration", () => {
  const quickPanelSource = readFileSync("src/quickTaskPanel.ts", "utf8");
  const calendarViewSource = readFileSync("src/taskCalendarView.ts", "utf8");
  const projectModalSource = readFileSync("src/projectFileSuggestModal.ts", "utf8");
  const mobilePanelSource = readFileSync("src/mobilePanelView.ts", "utf8");
  const deliverySource = readFileSync("src/projectDelivery.ts", "utf8");
  const mainSource = readFileSync("main.ts", "utf8");

  it("routes both quick inputs through the same composer instead of local preview implementations", () => {
    expect(quickPanelSource).toContain("this.plugin.openUnifiedTaskComposer");
    expect(calendarViewSource).toContain("this.plugin.openUnifiedTaskComposer");
    expect(quickPanelSource).not.toContain("createParsedTask");
    expect(calendarViewSource).not.toContain("renderQuickTaskPreview");
    expect(calendarViewSource).not.toContain("quickTaskOptions");
  });

  it("uses the shared parser and field UI for desktop and mobile home sends", () => {
    expect(projectModalSource).toContain("createUnifiedTaskComposer");
    expect(projectModalSource).toContain("renderUnifiedTaskSummary");
    expect(mobilePanelSource).toContain("createUnifiedTaskComposer");
    expect(mobilePanelSource).toContain("renderUnifiedTaskSummary");
  });

  it("reuses smart send and heading selection without opening a second task form", () => {
    expect(deliverySource).toContain("presetTask");
    expect(projectModalSource).toContain("if (this.options.presetTask)");
    expect(mobilePanelSource).toContain("if (options.presetTask)");
    expect(mainSource).toContain("deliverContentToProjectChoice");
    expect(mainSource).toContain("onUnifiedTaskWritten(file: TFile, task: ProjectTaskOptions)");
    expect(mainSource).toContain("await this.taskIndex.updateFile(file)");
    expect(mainSource).toContain("task.syncTarget !== \"tasks\"");
  });
});
