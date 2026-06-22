import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const formSource = readFileSync("src/taskOptionsForm.ts", "utf8");
const taskModalSource = readFileSync("src/taskOptionsModal.ts", "utf8");
const projectModalSource = readFileSync("src/projectFileSuggestModal.ts", "utf8");

describe("shared task options form", () => {
  it("centralizes task option controls for task and project send modals", () => {
    expect(formSource).toContain("export function createTaskOptionsForm");
    expect(formSource).toContain("export interface TaskOptionsFormSettings");
    expect(formSource).toContain("priority");
    expect(formSource).toContain("startDate");
    expect(formSource).toContain("scheduledDate");
    expect(formSource).toContain("dueDate");
    expect(formSource).toContain("doneDate");
    expect(formSource).toContain("recurrence");
    expect(formSource).toContain("addCreatedDate");
    expect(taskModalSource).toContain("createTaskOptionsForm");
    expect(projectModalSource).toContain("createTaskOptionsForm");
  });

  it("keeps task markdown generation outside of modal form rendering", () => {
    expect(formSource).not.toContain("buildTasksMarkdownLine");
    expect(formSource).not.toContain("renderTaskContentWithDetail");
    expect(taskModalSource).toContain("renderTaskContentWithOptions");
    expect(projectModalSource).not.toContain("normalizeTaskPriority(priority.value)");
  });
});
