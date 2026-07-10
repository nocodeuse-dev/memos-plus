import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const storeSource = readFileSync(new URL("../src/store.ts", import.meta.url), "utf8");
const mainSource = readFileSync(new URL("../main.ts", import.meta.url), "utf8");
const viewSource = readFileSync(new URL("../src/view.ts", import.meta.url), "utf8");
const quickInputSource = readFileSync(new URL("../src/quickInputView.ts", import.meta.url), "utf8");

describe("VaultIndex integration source constraints", () => {
  it("routes store metadata lookups through the shared VaultMetadataIndex", () => {
    expect(storeSource).toContain('from "./vaultIndex"');
    expect(storeSource).toContain("private readonly vaultIndex");
    expect(storeSource).toContain("this.vaultIndex.getProjectInfos");
    expect(storeSource).toContain("this.vaultIndex.getTaggedFileInfos");
    expect(storeSource).toContain("this.vaultIndex.searchMarkdownFileInfos");
    expect(storeSource).toContain("this.vaultIndex.scanFileTemplateLibrary");
  });

  it("invalidates the shared vault index from plugin vault and metadata events", () => {
    expect(mainSource).toContain("new VaultMetadataIndex(this.app)");
    expect(mainSource).toContain("registerVaultIndexInvalidation");
    expect(mainSource).toContain('metadataCache.on("changed"');
    expect(mainSource).toContain('vault.on("rename"');
  });

  it("passes the shared metadata index into vault saved search consumers", () => {
    expect(viewSource).toContain("new VaultSavedSearchIndex(this.app, this.plugin.vaultIndex)");
    expect(quickInputSource).toContain("new VaultSavedSearchIndex(this.app, this.plugin.vaultIndex)");
  });

  it("reuses the shared entry map instead of rebuilding every file for each picker query", () => {
    const indexSource = readFileSync(new URL("../src/vaultIndex.ts", import.meta.url), "utf8");
    const scanBlock = indexSource.match(/private \*scanEntries\(\)[\s\S]*?\n {2}\}/)?.[0] ?? "";

    expect(scanBlock).toContain("this.entries().values()");
    expect(scanBlock).not.toContain("getMarkdownFiles()");
    expect(scanBlock).not.toContain("this.buildEntry(file)");
  });
});
