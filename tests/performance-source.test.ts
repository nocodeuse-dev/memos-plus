import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const viewSource = readFileSync("src/view.ts", "utf8");
const projectModalSource = readFileSync("src/projectFileSuggestModal.ts", "utf8");
const projectSendSource = readFileSync("src/projectSend.ts", "utf8");
const iconPickerSource = readFileSync("src/iconPicker.ts", "utf8");
const settingsSource = readFileSync("src/settings.ts", "utf8");

describe("performance source safeguards", () => {
  it("does not warm full-vault saved-search cache during the initial full render", () => {
    const renderBody = viewSource.match(/async render\(\): Promise<void> \{([\s\S]*?)\n {2}\}/)?.[1] ?? "";
    expect(renderBody).not.toContain("ensureVaultSearchCache");
  });

  it("debounces main search without rebuilding the whole view on every keypress", () => {
    expect(viewSource).toContain("scheduleTimelineRender");
    const searchInputHandler = viewSource.match(/search\.addEventListener\("input", \(\) => \{([\s\S]*?)\n {6}\}\);/)?.[1] ?? "";
    expect(searchInputHandler).toContain("scheduleTimelineRender");
    expect(searchInputHandler).not.toContain("void this.render()");
  });

  it("uses effective page size instead of raw settings page size for mobile-safe pagination", () => {
    expect(viewSource).toContain("effectivePageSize");
    expect(viewSource).toContain("this.pageSize()");
    expect(viewSource).not.toContain("this.visibleCount += this.plugin.settings.pageSize");
  });

  it("caches memo saved-search counts during sidebar rendering", () => {
    const countBody = viewSource.match(/private countForSavedSearch\(search: SavedSearch\): number \| string \{([\s\S]*?)\n {2}\}/)?.[1] ?? "";
    expect(viewSource).toContain("memoSearchCountCache");
    expect(viewSource).toContain("memoSearchBaseCache");
    expect(viewSource).toContain("memoSearchBaseFor");
    expect(countBody).toContain("this.memoSearchCountCache.get");
    expect(countBody).toContain("this.memoSearchCountCache.set");
    expect(countBody).toContain("this.memoSearchBaseFor(search)");
  });

  it("caches memo tag options reused by timeline renders", () => {
    const renderTimelineBody = viewSource.match(/private async renderTimeline\(main: Element\): Promise<void> \{([\s\S]*?)\n {2}\}/)?.[1] ?? "";
    expect(viewSource).toContain("memoTagOptionsCache");
    expect(viewSource).toContain("private memoTagOptions(): string[]");
    expect(renderTimelineBody).toContain("this.memoTagOptions()");
    expect(renderTimelineBody).not.toContain("getAllTags(this.memos)");
  });

  it("does not load all file-send tags as soon as the project modal opens", () => {
    const onOpenBody = projectModalSource.match(/onOpen\(\): void \{([\s\S]*?)\n {2}\}/)?.[1] ?? "";
    expect(onOpenBody).not.toContain("loadTags");
    expect(projectModalSource).toContain("ensureTagsLoaded");
  });

  it("loads project and recent file targets lazily inside the send modal", () => {
    const projectDeliverySource = readFileSync("src/projectDelivery.ts", "utf8");
    const sendBody = projectDeliverySource.match(/export async function sendContentToProject\([\s\S]*?\n\}: Promise<ProjectDeliveryResult \| null> \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const selectBody = projectDeliverySource.match(/async function selectProjectTarget\([\s\S]*?\n\): Promise<ProjectSendChoice \| null> \{([\s\S]*?)\n\}/)?.[1] ?? "";

    expect(sendBody).not.toContain("await host.store.getProjects()");
    expect(selectBody).not.toContain("await host.store.getRecentFileTargets()");
    expect(selectBody).toContain("onLoadProjects");
    expect(selectBody).toContain("onLoadRecentFiles");
    expect(projectModalSource).toContain("ensureProjectsLoaded");
    expect(projectModalSource).toContain("ensureRecentFilesLoaded");
  });

  it("does not prewarm the full project list on mobile before a search", () => {
    const projectListSource = projectModalSource.slice(
      projectModalSource.indexOf("private renderProjectList(): void"),
      projectModalSource.indexOf("private renderProjectListContent")
    );

    expect(projectModalSource).toContain("shouldDeferProjectLoadForMobile");
    expect(projectListSource).toContain("this.shouldDeferProjectLoadForMobile()");
    expect(projectListSource).toContain("if (this.shouldDeferProjectLoadForMobile())");
    expect(projectListSource).toContain("if (!this.shouldDeferProjectLoadForMobile())");
  });

  it("does not run an empty full-vault file search on mobile", () => {
    const searchContentSource = projectModalSource.slice(
      projectModalSource.indexOf("private async renderFileSearchContent"),
      projectModalSource.indexOf("private renderFileList(")
    );

    expect(projectModalSource).toContain("shouldSkipEmptyMobileFileSearch");
    expect(searchContentSource).toContain("this.shouldSkipEmptyMobileFileSearch(query)");
    expect(searchContentSource.indexOf("this.shouldSkipEmptyMobileFileSearch(query)")).toBeLessThan(searchContentSource.indexOf("this.searchFilesCached(query)"));
  });

  it("caches tagged file and search results inside the send modal", () => {
    const taggedFilesSource = projectModalSource.slice(
      projectModalSource.indexOf("private async renderTaggedFiles"),
      projectModalSource.indexOf("private async renderCustomTagFiles")
    );
    const customTagSource = projectModalSource.slice(
      projectModalSource.indexOf("private async renderCustomTagFiles"),
      projectModalSource.indexOf("private renderRecentFiles")
    );
    const searchContentSource = projectModalSource.slice(
      projectModalSource.indexOf("private async renderFileSearchContent"),
      projectModalSource.indexOf("private renderFileList(")
    );

    expect(projectModalSource).toContain("taggedFilesCache");
    expect(projectModalSource).toContain("fileSearchCache");
    expect(projectModalSource).toContain("loadTaggedFilesCached");
    expect(projectModalSource).toContain("searchFilesCached");
    expect(taggedFilesSource).not.toContain("this.options.onLoadTaggedFiles");
    expect(customTagSource).not.toContain("this.options.onLoadTaggedFiles");
    expect(searchContentSource).not.toContain("this.options.onSearchFiles");
  });

  it("caches file headings inside the send modal", () => {
    const headingPickerSource = projectModalSource.slice(
      projectModalSource.indexOf("private async renderHeadingPicker"),
      projectModalSource.indexOf("private renderFilePositionButtons")
    );

    expect(projectModalSource).toContain("fileHeadingsCache");
    expect(projectModalSource).toContain("loadHeadingsCached");
    expect(headingPickerSource).toContain("this.loadHeadingsCached(info.file)");
    expect(headingPickerSource).not.toContain("this.options.onLoadHeadings(info.file)");
  });

  it("does not use the legacy project insert template fallback at write time", () => {
    const storeSource = readFileSync("src/store.ts", "utf8");

    expect(storeSource).not.toContain("renderProjectInsertTemplate");
    expect(storeSource).not.toContain("settings.projectInsertTemplate");
    expect(storeSource).not.toContain("projectTemplateOptions");
  });

  it("keeps legacy project insert template rendering out of the runtime project delivery module", () => {
    expect(projectSendSource).not.toContain("renderProjectInsertTemplate");
    expect(projectSendSource).not.toContain("extractFirstUrl");
  });

  it("removes the legacy project template compatibility module from source", () => {
    expect(existsSync("src/projectTemplate.ts")).toBe(false);
    expect(existsSync("src/legacyProjectTemplate.ts")).toBe(false);
    expect(settingsSource).not.toContain('from "./legacyProjectTemplate"');
  });

  it("keeps removed legacy project template fields out of normalized settings", () => {
    expect(settingsSource).not.toContain("DEFAULT_PROJECT_INSERT_TEMPLATE");
    expect(settingsSource).not.toContain("inferLegacyTemplateInsertFormat");
    expect(settingsSource).not.toContain("raw.projectInsertTemplate");
    expect(settingsSource).not.toContain("raw.projectTemplateOptions");
    expect(settingsSource).not.toContain("raw.projectInsertHeading");

    const settingsInterface = settingsSource.match(/export interface MemosPlusSettings \{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(settingsInterface).not.toContain("projectInsertHeading");
    expect(settingsInterface).not.toContain("createProjectHeadingIfMissing");
    expect(settingsInterface).not.toContain("projectTemplateOptions");
    expect(settingsInterface).not.toContain("projectInsertTemplate");
  });

  it("limits and debounces icon picker rendering", () => {
    expect(iconPickerSource).toContain("iconPickerResultLimit");
    expect(iconPickerSource).toContain("debounce");
    expect(iconPickerSource).not.toContain(".slice(0, 160)");
  });

  it("renders performance settings in the advanced settings tab", () => {
    expect(settingsSource).toContain("settings.performanceDebugMode");
    expect(settingsSource).toContain("settings.mobilePerformanceMode");
    expect(settingsSource).toContain("settings.performanceSafeMode");
  });
});
