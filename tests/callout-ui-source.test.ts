import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const viewSource = readFileSync("src/view.ts", "utf8");
const widgetSource = readFileSync("src/composerWidget.ts", "utf8");
const composerSessionSource = readFileSync("src/composerSession.ts", "utf8");
const composerActionsSource = readFileSync("src/composerActions.ts", "utf8");
const deliverySource = readFileSync("src/projectDelivery.ts", "utf8");
const settingsSource = readFileSync("src/settings.ts", "utf8");
const i18nSource = readFileSync("src/i18n.ts", "utf8");

describe("callout UI wiring", () => {
  it("adds a composer callout mode button and status", () => {
    expect(widgetSource).toContain("calloutMode");
    expect(widgetSource).toContain('labelKey: "toolbar.calloutMode"');
    expect(widgetSource).toContain("memos-plus-callout-status");
  });

  it("applies callout preparation before saving memos or sending to projects", () => {
    expect(viewSource).toContain("createComposerSession");
    expect(composerSessionSource).toContain("createComposerActions");
    expect(composerActionsSource).toContain("prepareCalloutContent");
    expect(composerActionsSource).toContain("prepared.preformatted");
    expect(deliverySource).toContain("sendToFileTarget(choice.file, prepared.content");
  });

  it("renders callout settings in the Memos settings tab", () => {
    expect(settingsSource).toContain("settings.calloutSettings");
    expect(settingsSource).toContain("settings.calloutEnabled");
    expect(settingsSource).toContain("settings.calloutType");
    expect(settingsSource).toContain("settings.calloutAutoForLongContent");
  });

  it("includes Chinese and English callout labels", () => {
    expect(i18nSource).toContain('"toolbar.calloutMode": "Callout 模式"');
    expect(i18nSource).toContain('"toolbar.calloutMode": "Callout mode"');
    expect(i18nSource).toContain('"settings.calloutSettings": "Callout"');
  });
});
