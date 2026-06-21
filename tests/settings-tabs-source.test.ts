import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const settingsSource = readFileSync("src/settings.ts", "utf8");
const i18nSource = readFileSync("src/i18n.ts", "utf8");
const styles = readFileSync("styles.css", "utf8");

describe("settings top tabs source", () => {
  it("renders settings through a horizontal top tab bar", () => {
    expect(settingsSource).toContain("type SettingsTabId");
    expect(settingsSource).toContain("SETTINGS_TABS");
    expect(settingsSource).toContain("currentSettingTab");
    expect(settingsSource).toContain("renderSettingsTabs");
    expect(settingsSource).toContain("renderSettingsTabButton");
    expect(settingsSource).toContain("renderActiveSettingsTab");
    expect(settingsSource).toContain('private currentSettingTab: SettingsTabId = "layout"');
    expect(settingsSource).not.toContain("SETTINGS_CENTER_CARDS");
    expect(settingsSource).not.toContain("renderSettingsCenterCard");
    expect(settingsSource).toContain("renderTemplateManagementSettings");
    expect(settingsSource).toContain("renderInputToolSettings");
    expect(settingsSource).toContain("renderSendRulesSettings");
    expect(settingsSource).toContain("renderRecordSettings");
    expect(settingsSource).toContain("renderTasksSettings");
    expect(settingsSource).toContain("renderDirectoryFilterSettings");
    expect(settingsSource).toContain("renderLayoutSettings");
    expect(settingsSource).toContain("renderDisplaySettings");
    expect(settingsSource).toContain("renderPerformanceDataSettings");
    expect(settingsSource).toContain("renderAdvancedSettings");
    const switchSource = settingsSource.slice(settingsSource.indexOf("private renderActiveSettingsTab"), settingsSource.indexOf("private renderSettingsTabs"));
    expect(switchSource).not.toContain("renderProjectSettings");
  });

  it("puts layout first and preserves the tab bar while switching categories", () => {
    const tabsSource = settingsSource.slice(settingsSource.indexOf("const SETTINGS_TABS"), settingsSource.indexOf("export function normalizeSettings"));
    const tabIds = [...tabsSource.matchAll(/\{ id: "([^"]+)"/g)].map((match) => match[1]);
    expect(tabIds).toEqual([
      "layout",
      "sendRules",
      "inputTools",
      "records",
      "tasks",
      "fileTemplates",
      "directoryFilters",
      "display",
      "performanceData",
      "advanced"
    ]);

    const tabButtonSource = settingsSource.slice(settingsSource.indexOf("private renderSettingsTabButton"), settingsSource.indexOf("private renderSectionHeader"));
    expect(tabButtonSource).toContain("this.switchSettingsTab(tab.id, button)");
    expect(tabButtonSource).not.toContain("this.display()");
    expect(settingsSource).toContain("restoreSettingsTabsScroll");
    expect(settingsSource).toContain("private renderCurrentSettingsPanel()");
    expect(settingsSource).toContain("private updateSettingsTabButtons()");
  });

  it("defines the requested settings tab labels in i18n keys", () => {
    for (const key of [
      "settings.tab.sendRules",
      "settings.tab.input",
      "settings.tab.records",
      "settings.tab.tasks",
      "settings.tab.fileTemplates",
      "settings.tab.filters",
      "settings.tab.layout",
      "settings.tab.display",
      "settings.tab.performance",
      "settings.tab.advanced",
      "settings.layoutDesigner.surface.home",
      "settings.layoutDesigner.surface.sidebar",
      "settings.layoutDesigner.surface.mobile"
    ]) {
      expect(`${settingsSource}\n${i18nSource}`).toContain(key);
    }
  });

  it("labels the old template area as send rules with readable summaries", () => {
    expect(settingsSource).toContain("formatManagedTemplateSummary");
    expect(settingsSource).toContain("settings.templateSummaryDestination");
    expect(settingsSource).toContain("settings.templateSummaryLookup");
    expect(settingsSource).toContain("settings.templateSummaryInsert");
    expect(settingsSource).toContain("settings.templateSummaryFormat");
  });

  it("does not keep the old standalone project settings UI around", () => {
    expect(settingsSource).not.toContain("private renderProjectSettings");
    expect(settingsSource).not.toContain("private renderProjectTemplateEditor");
    expect(settingsSource).not.toContain("private renderCustomProjectTemplateEditor");
    expect(settingsSource).not.toContain("private updateProjectTemplateOptions");
  });

  it("does not keep legacy project insert template labels in the visible settings copy", () => {
    expect(i18nSource).not.toContain('"settings.projectInsertTemplate"');
    expect(i18nSource).not.toContain('"settings.projectTemplateFormat"');
    expect(i18nSource).not.toContain('"projectTemplate.format.note"');
    expect(i18nSource).not.toContain("项目插入模板");
    expect(i18nSource).not.toContain("Project insert template");
  });

  it("places template task-format rules inside the tasks settings tab", () => {
    const tasksSource = settingsSource.slice(settingsSource.indexOf("private renderTasksSettings"), settingsSource.indexOf("private renderTaskIndexSettings"));

    expect(settingsSource).toContain("renderTemplateTaskRuleSettings");
    expect(tasksSource).toContain("this.renderTemplateTaskRuleSettings(container)");
    expect(tasksSource).not.toContain("this.renderTaskIndexSettings(container)");
    expect(settingsSource).toContain("settings.templateTaskRules");
    expect(settingsSource).toContain("TEMPLATE_TASK_MODES");
    expect(settingsSource).toContain("templateManager.taskAutoKeywords");
  });

  it("moves sending dialog tabs, sidebar quick input, mobile settings, and task cache to the requested groups", () => {
    const sendSource = settingsSource.slice(settingsSource.indexOf("private renderSendRulesSettings"), settingsSource.indexOf("private renderInputToolSettings"));
    const inputSource = settingsSource.slice(settingsSource.indexOf("private renderInputToolSettings"), settingsSource.indexOf("private renderComposerAppearanceSettings"));
    const displaySource = settingsSource.slice(settingsSource.indexOf("private renderDisplaySettings"), settingsSource.indexOf("private renderLayoutSettings"));
    const tasksSource = settingsSource.slice(settingsSource.indexOf("private renderTasksSettings"), settingsSource.indexOf("private renderTaskIndexSettings"));
    const sidebarSource = settingsSource.slice(settingsSource.indexOf("private renderSidebarLayoutSettings"), settingsSource.indexOf("private renderMobileLayoutSettings"));
    const mobileSource = settingsSource.slice(settingsSource.indexOf("private renderMobileLayoutSettings"), settingsSource.indexOf("private renderDirectoryFilterSettings"));
    const performanceSource = settingsSource.slice(settingsSource.indexOf("private renderPerformanceDataSettings"), settingsSource.indexOf("private renderAdvancedSettings"));

    expect(sendSource).toContain("this.renderProjectSendTabSettings(container)");
    expect(sendSource).toContain("this.renderManagedTemplateSettings(container)");
    expect(inputSource).not.toContain("this.renderQuickInputSettings(container)");
    expect(inputSource).not.toContain("this.renderComposerAppearanceSettings(container)");
    expect(displaySource).toContain("this.renderComposerAppearanceSettings(container)");
    expect(tasksSource).toContain("this.renderTaskIndexSummary(container)");
    expect(tasksSource).not.toContain("this.renderTaskIndexSettings(container)");
    expect(sidebarSource).toContain("this.renderQuickInputSettings(container)");
    expect(mobileSource).toContain("this.renderMobileLightHomeSettings(container)");
    expect(performanceSource).toContain("this.renderTaskIndexSettings(container)");
  });

  it("styles settings as horizontally scrollable top tabs instead of cards", () => {
    expect(styles).toContain(".memos-plus-settings-tabs");
    expect(styles).toContain("overflow-x: auto");
    expect(styles).toContain(".memos-plus-settings-tab");
    expect(styles).toContain(".memos-plus-settings-tab.is-active");
    expect(styles).not.toContain(".memos-plus-settings-center-card");
  });
});
