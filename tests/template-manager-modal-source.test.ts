import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const modalSource = readFileSync("src/templateManagerModal.ts", "utf8");
const i18nSource = readFileSync("src/i18n.ts", "utf8");

describe("template manager editor source", () => {
  it("uses a simplified format-rule layout for the template editor", () => {
    for (const key of [
      "templateManager.section.basic",
      "templateManager.section.format",
      "templateManager.section.afterSend",
      "templateManager.advanced"
    ]) {
      expect(modalSource).toContain(key);
      expect(i18nSource).toContain(key);
    }

    expect(modalSource).toContain("renderBasicInfoSection");
    expect(modalSource).toContain("renderFormatSection");
    expect(modalSource).toContain("renderAfterSendSection");
    expect(modalSource).toContain("normalizeTemplateBoundHeadings");
    expect(modalSource).toContain('setName(t(lang, "templateManager.boundHeadings"))');
    expect(i18nSource).toContain('"templateManager.boundHeadings"');
    expect(i18nSource).toContain('"templateManager.boundHeadingsDesc"');
    expect(modalSource).not.toContain("renderTargetFileSection");
    expect(modalSource).not.toContain("renderNewFileSection");
    expect(modalSource).not.toContain("renderInsertSection");
    expect(modalSource).not.toContain("TEMPLATE_INSERT_LOCATIONS");
  });

  it("keeps template-owned task rules out of the template editor", () => {
    expect(modalSource).not.toContain("renderTaskFormatSection");
    expect(modalSource).not.toContain("templateManager.section.task");
    expect(modalSource).not.toContain('setName(t(lang, "templateManager.taskMode"))');
  });

  it("keeps destination and insertion fields out of the format-rule editor", () => {
    expect(modalSource).toContain("purposeFromTemplate");
    expect(modalSource).toContain("applyPurpose");
    expect(modalSource).toContain('if (this.draft.insertFormat === "custom")');
    expect(modalSource).not.toContain('if (purpose === "fixed-file")');
    expect(modalSource).not.toContain('if (purpose === "new-file")');
    expect(modalSource).not.toContain('if (this.draft.insertLocation === "heading")');
    expect(modalSource).not.toContain('if (this.draft.insertLocation === "new-heading")');
    expect(modalSource).not.toContain('setName(t(lang, "templateManager.heading"))');
    expect(modalSource).not.toContain('setName(t(lang, "templateManager.newFileTemplate"))');
    expect(modalSource).not.toContain('setName(t(lang, "templateManager.folder"))');
    expect(modalSource).not.toContain('setName(t(lang, "templateManager.targetSource"))');
    expect(modalSource).not.toContain('setName(t(lang, "templateManager.type"))');
  });

  it("only shows custom template editing when custom format is selected", () => {
    const advancedSource = modalSource.slice(modalSource.indexOf("private renderAdvancedSettings"), modalSource.indexOf("private renderCustomTemplateEditor"));

    expect(modalSource).toContain('if (this.draft.insertFormat === "custom")');
    expect(advancedSource).not.toContain("renderCustomTemplateEditor");
    expect(modalSource).not.toContain('this.draft.insertFormat !== "custom"');
  });

  it("keeps task detail mode choices explicit in the format-rule editor", () => {
    expect(modalSource).toContain("FORMAT_RULE_TASK_CONTENT_MODES");
    expect(modalSource).not.toContain("TEMPLATE_TASK_CONTENT_MODES");
    expect(i18nSource).not.toContain('"templateManager.taskContentMode.ask"');
  });

  it("uses friendlier Chinese labels instead of duplicate technical wording", () => {
    expect(i18nSource).toContain('"templateManager.addTemplate": "新增发送格式规则"');
    expect(i18nSource).toContain('"templateManager.editTemplate": "编辑发送格式规则"');
    expect(i18nSource).toContain('"templateManager.editorDesc": "发送格式规则只决定输入框内容最终保存成什么 Markdown。文件、标题和插入位置在发送弹窗里选择；新文件骨架模板在“新建文件模板库”里管理。"');
    expect(i18nSource).toContain('"templateManager.name": "规则名称"');
    expect(i18nSource).toContain('"templateManager.purpose": "适用入口"');
    expect(i18nSource).toContain('"templateManager.insertFormat": "输入内容保存成"');
    expect(i18nSource).toContain('"templateManager.section.format": "输入内容变成什么格式"');
    expect(i18nSource).not.toContain('"templateManager.taskMode"');
    expect(i18nSource).not.toContain('"templateManager.taskAutoKeywords"');
  });
});
