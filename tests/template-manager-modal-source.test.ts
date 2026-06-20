import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const modalSource = readFileSync("src/templateManagerModal.ts", "utf8");
const i18nSource = readFileSync("src/i18n.ts", "utf8");

describe("template manager editor source", () => {
  it("uses a simplified Chinese section layout for the template editor", () => {
    for (const key of [
      "templateManager.section.basic",
      "templateManager.section.target",
      "templateManager.section.newFile",
      "templateManager.section.insert",
      "templateManager.section.format",
      "templateManager.section.afterSend",
      "templateManager.advanced"
    ]) {
      expect(modalSource).toContain(key);
      expect(i18nSource).toContain(key);
    }

    expect(modalSource).toContain("renderBasicInfoSection");
    expect(modalSource).toContain("renderTargetFileSection");
    expect(modalSource).toContain("renderNewFileSection");
    expect(modalSource).toContain("renderInsertSection");
    expect(modalSource).toContain("renderFormatSection");
    expect(modalSource).toContain("renderAfterSendSection");
  });

  it("keeps template-owned task rules out of the template editor", () => {
    expect(modalSource).not.toContain("renderTaskFormatSection");
    expect(modalSource).not.toContain("templateManager.section.task");
    expect(modalSource).not.toContain('setName(t(lang, "templateManager.taskMode"))');
  });

  it("keeps technical template fields behind purpose-specific or advanced UI", () => {
    expect(modalSource).toContain("purposeFromTemplate");
    expect(modalSource).toContain("applyPurpose");
    expect(modalSource).toContain('if (purpose === "fixed-file")');
    expect(modalSource).toContain('if (purpose === "new-file")');
    expect(modalSource).toContain('if (this.draft.insertLocation === "heading")');
    expect(modalSource).toContain('if (this.draft.insertFormat === "custom")');
    expect(modalSource).not.toContain('setName(t(lang, "templateManager.targetSource"))');
    expect(modalSource).not.toContain('setName(t(lang, "templateManager.type"))');
  });

  it("uses friendlier Chinese labels instead of duplicate technical wording", () => {
    expect(i18nSource).toContain('"templateManager.addTemplate": "新增发送规则"');
    expect(i18nSource).toContain('"templateManager.editTemplate": "编辑发送规则"');
    expect(i18nSource).toContain('"templateManager.editorDesc": "发送规则用来决定：输入框内容发到哪里、插到文件哪里、保存成什么格式。新建文件的骨架模板在“新建文件模板库”里管理。"');
    expect(i18nSource).toContain('"templateManager.name": "规则名称"');
    expect(i18nSource).toContain('"templateManager.purpose": "发送用途"');
    expect(i18nSource).toContain('"templateManager.findProjectTag": "查找带有哪个标签的项目文件"');
    expect(i18nSource).toContain('"templateManager.findFileTag": "查找带有哪个标签的文件"');
    expect(i18nSource).toContain('"templateManager.newFileTags": "新建文件标签"');
    expect(i18nSource).toContain('"templateManager.insertLocation": "插入到哪里"');
    expect(i18nSource).toContain('"templateManager.heading": "标题名称"');
    expect(i18nSource).toContain('"templateManager.insertFormat": "输入内容保存成"');
    expect(i18nSource).toContain('"templateManager.section.target": "第一步：发到哪里"');
    expect(i18nSource).toContain('"templateManager.section.insert": "第二步：插到文件哪里"');
    expect(i18nSource).toContain('"templateManager.section.format": "第三步：输入内容变成什么格式"');
    expect(i18nSource).toContain('"templateManager.taskMode": "是否启用任务格式"');
    expect(i18nSource).toContain('"templateManager.taskMode.ask": "发送时询问"');
    expect(i18nSource).toContain('"templateManager.taskAutoKeywords": "内容包含关键词"');
    expect(i18nSource).toContain('"templateManager.taskAutoHeadings": "目标标题是"');
  });
});
