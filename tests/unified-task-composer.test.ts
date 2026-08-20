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

  it("passes parsed ranges, reminder timestamps, and repeat rules to the existing task form", () => {
    const draft = createUnifiedTaskDraft("每周一上午9点到10点开会，提前30分钟提醒", taskSettings, {
      task: { isTask: true, syncTarget: "calendar" }
    });

    expect(draft.task).toMatchObject({
      syncTarget: "calendar",
      startDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      startTime: "09:00",
      endTime: "10:00",
      dueTime: "09:00",
      reminderMinutesBefore: 30,
      recurrence: "custom",
      customRecurrence: "every week on Monday"
    });
  });
});

describe("unified task composer integration", () => {
  const quickPanelSource = readFileSync("src/quickTaskPanel.ts", "utf8");
  const calendarViewSource = readFileSync("src/taskCalendarView.ts", "utf8");
  const projectModalSource = readFileSync("src/projectFileSuggestModal.ts", "utf8");
  const mobilePanelSource = readFileSync("src/mobilePanelView.ts", "utf8");
  const deliverySource = readFileSync("src/projectDelivery.ts", "utf8");
  const mainSource = readFileSync("main.ts", "utf8");
  const composerSource = readFileSync("src/unifiedTaskComposer.ts", "utf8");
  const stylesSource = readFileSync("styles.css", "utf8");

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

  it("closes after the local write instead of waiting for Apple synchronization", () => {
    const postWrite = mainSource.slice(
      mainSource.indexOf("async onUnifiedTaskWritten"),
      mainSource.indexOf("async toggleTaskCalendarTask")
    );
    expect(postWrite).toContain('this.runAsyncOperation("sync Apple after unified task write"');
    expect(postWrite).not.toContain("await this.syncAppleNow");
    expect(composerSource).toContain('button.setAttr("aria-busy", "true")');
    expect(composerSource).toContain('button.setText(t(this.plugin.settings.language, "unifiedTask.creating"))');
  });

  it("shows that the inbox is already selected instead of appearing unresponsive", () => {
    expect(composerSource).toContain('this.inboxButtonEl?.toggleClass("is-selected", !target)');
    expect(composerSource).toContain('this.inboxButtonEl?.setAttr("aria-pressed", String(!target))');
    expect(stylesSource).toContain(".memos-plus-unified-task-destination-actions > button.is-selected");
  });

  it("sizes the outer modal shell and keeps destination actions out of the path row", () => {
    expect(composerSource).toContain('this.modalEl.addClass("memos-plus-unified-task-modal-shell")');
    expect(composerSource).toContain('destination.createDiv({ cls: "memos-plus-unified-task-destination-actions" })');
    expect(composerSource).toContain('destinationActions.createEl("button"');
    expect(stylesSource).toContain(".memos-plus-unified-task-modal-shell .modal-content");
    expect(stylesSource).toContain(".memos-plus-unified-task-destination-actions");
    expect(stylesSource).toContain("overflow-x: hidden;");
  });

  it("keeps parser values shared and lets the result open the existing field editor", () => {
    expect(composerSource).toContain("taskOptionsForm.applyTask(createUnifiedTaskDraft(source");
    expect(composerSource).toContain('preview.addEventListener("click"');
    expect(composerSource).toContain("details.open = true");
    expect(stylesSource).toContain("button.memos-plus-unified-task-preview");
  });
});
