import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const modalSource = readFileSync("src/savedSearchModal.ts", "utf8");
const viewSource = readFileSync("src/view.ts", "utf8");
const i18nSource = readFileSync("src/i18n.ts", "utf8");

describe("saved search vault scope UI source", () => {
  it("adds a full-vault search toggle to the saved search modal", () => {
    expect(modalSource).toContain("scopeToggle");
    expect(modalSource).toContain("savedSearch.searchEntireVault");
    expect(modalSource).toContain('searchScope: this.scopeToggle?.checked ? "vault" : "memos"');
  });

  it("renders vault search results separately from memo cards", () => {
    expect(viewSource).toContain("renderVaultSearchResults");
    expect(viewSource).toContain("VaultSavedSearchIndex");
    expect(viewSource).toContain("savedSearch.searchScope === \"vault\"");
    expect(i18nSource).toContain("savedSearch.noVaultPreview");
    expect(i18nSource).toContain("vaultSearch.files");
  });

  it("adds localized Obsidian Tasks condition fields and value controls", () => {
    expect(modalSource).toContain("TASK_STATUS_VALUES");
    expect(modalSource).toContain("TASK_PRIORITY_VALUES");
    expect(modalSource).toContain("TASK_DATE_FIELDS");
    expect(modalSource).toContain('"taskStatus"');
    expect(modalSource).toContain('"taskDueDate"');
    expect(modalSource).toContain("savedSearch.taskDate.${token");
    expect(i18nSource).toContain('"savedSearch.field.taskStatus": "任务状态"');
    expect(i18nSource).toContain('"savedSearch.field.taskPriority": "任务优先级"');
    expect(i18nSource).toContain('"savedSearch.field.taskDueDate": "截止日期"');
    expect(i18nSource).toContain('"savedSearch.taskStatus.open": "未完成"');
    expect(i18nSource).toContain('"savedSearch.taskPriority.high": "高"');
  });
});
