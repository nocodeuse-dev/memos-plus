import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const SEMVER = /^\d+\.\d+\.\d+$/;

async function readJson(path) {
  return JSON.parse(await readFile(join(ROOT, path), "utf8"));
}

function normalizeTag(tag) {
  if (!tag) {
    return undefined;
  }
  return tag.startsWith("v") ? tag.slice(1) : tag;
}

function addMismatch(mismatches, label, actual, expected) {
  if (actual !== expected) {
    mismatches.push(`${label}: expected ${expected}, got ${actual}`);
  }
}

async function main() {
  const tagVersion = normalizeTag(process.argv[2] ?? process.env.GITHUB_REF_NAME);
  const pkg = await readJson("package.json");
  const manifest = await readJson("manifest.json");
  const lock = await readJson("package-lock.json");
  const versions = await readJson("versions.json");
  const mismatches = [];

  if (!SEMVER.test(manifest.version)) {
    mismatches.push(`manifest.json version is not semver: ${manifest.version}`);
  }
  if (tagVersion && !SEMVER.test(tagVersion)) {
    mismatches.push(`release tag is not vX.Y.Z or X.Y.Z: ${process.argv[2] ?? process.env.GITHUB_REF_NAME}`);
  }

  addMismatch(mismatches, "package.json version", pkg.version, manifest.version);
  addMismatch(mismatches, "package-lock.json version", lock.version, manifest.version);
  addMismatch(mismatches, "package-lock root package version", lock.packages?.[""]?.version, manifest.version);
  addMismatch(mismatches, "versions.json current minAppVersion", versions[manifest.version], manifest.minAppVersion);
  addMismatch(mismatches, "manifest.json id", manifest.id, "memos-plus");
  addMismatch(mismatches, "package.json name", pkg.name, "memos-plus");
  addMismatch(mismatches, "manifest.json author", manifest.author, "nocodeuse-dev");
  addMismatch(mismatches, "package.json author", pkg.author, "nocodeuse-dev");

  if (tagVersion) {
    addMismatch(mismatches, "release tag version", tagVersion, manifest.version);
  }

  if (manifest.isDesktopOnly !== false) {
    mismatches.push("manifest.json isDesktopOnly must remain false for mobile support");
  }

  if (mismatches.length > 0) {
    console.error("Release version check failed:");
    for (const mismatch of mismatches) {
      console.error(`- ${mismatch}`);
    }
    process.exit(1);
  }

  console.log(`Release version check passed for memos-plus ${manifest.version}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
