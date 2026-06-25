import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const REPOSITORY = "nocodeuse-dev/memos-plus";
const RELEASE_WORKFLOW = "Release";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit"
  });
  if (result.status !== 0 && !options.allowFailure) {
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
    throw new Error(`Command failed: ${command} ${args.join(" ")}${output ? `\n${output}` : ""}`);
  }
  return result;
}

async function readJson(path) {
  return JSON.parse(await readFile(join(ROOT, path), "utf8"));
}

async function writeJson(path, value) {
  await writeFile(join(ROOT, path), `${JSON.stringify(value, null, 2)}\n`);
}

function bumpPatch(version) {
  const parts = version.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
    throw new Error(`Cannot bump non-semver version: ${version}`);
  }
  parts[2] += 1;
  return parts.join(".");
}

async function bumpVersion() {
  const pkg = await readJson("package.json");
  const manifest = await readJson("manifest.json");
  const versions = await readJson("versions.json");
  const lock = await readJson("package-lock.json");
  const nextVersion = bumpPatch(manifest.version);

  pkg.version = nextVersion;
  manifest.version = nextVersion;
  versions[nextVersion] = manifest.minAppVersion;
  if (lock.version !== undefined) {
    lock.version = nextVersion;
  }
  if (lock.packages?.[""]?.version !== undefined) {
    lock.packages[""].version = nextVersion;
  }

  await writeJson("package.json", pkg);
  await writeJson("manifest.json", manifest);
  await writeJson("versions.json", versions);
  await writeJson("package-lock.json", lock);
  return nextVersion;
}

function ensureGitHubAccount() {
  const login = run("gh", ["api", "user", "--jq", ".login"], { capture: true }).stdout.trim();
  if (login !== "nocodeuse-dev") {
    throw new Error(`Expected GitHub account nocodeuse-dev, got ${login || "unknown"}`);
  }
}

function ensureRemote() {
  const remote = run("git", ["remote", "get-url", "origin"], { capture: true }).stdout.trim();
  if (!remote.includes("nocodeuse-dev/memos-plus")) {
    throw new Error(`Expected origin to point at ${REPOSITORY}, got ${remote || "none"}`);
  }
}

function ensureTagAvailable(tag) {
  const local = run("git", ["rev-parse", "-q", "--verify", `refs/tags/${tag}`], {
    capture: true,
    allowFailure: true
  });
  if (local.status === 0) {
    throw new Error(`Local tag already exists: ${tag}`);
  }

  const remote = run("git", ["ls-remote", "--tags", "origin", tag], { capture: true });
  if (remote.stdout.trim()) {
    throw new Error(`Remote tag already exists: ${tag}`);
  }
}

function findReleaseRun(tag) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const result = run("gh", [
      "run",
      "list",
      "--repo",
      REPOSITORY,
      "--workflow",
      RELEASE_WORKFLOW,
      "--limit",
      "10",
      "--json",
      "databaseId,headBranch,status,conclusion"
    ], { capture: true });
    const runs = JSON.parse(result.stdout);
    const runForTag = runs.find((runItem) => runItem.headBranch === tag);
    if (runForTag) {
      return String(runForTag.databaseId);
    }
    run("sleep", ["3"]);
  }
  throw new Error(`Could not find GitHub Actions release run for ${tag}`);
}

function verifyReleaseAssets(tag) {
  const result = run("gh", [
    "release",
    "view",
    tag,
    "--repo",
    REPOSITORY,
    "--json",
    "assets",
    "--jq",
    ".assets[].name"
  ], { capture: true });
  const assets = new Set(result.stdout.trim().split(/\s+/).filter(Boolean));
  for (const asset of ["main.js", "manifest.json", "styles.css"]) {
    if (!assets.has(asset)) {
      throw new Error(`Release ${tag} is missing asset ${asset}`);
    }
  }
}

async function main() {
  ensureGitHubAccount();
  ensureRemote();

  const version = await bumpVersion();
  const tag = version;
  ensureTagAvailable(tag);

  run("npm", ["test"]);
  run("npm", ["run", "build"]);
  run("npm", ["run", "check:release-version", "--", tag]);

  run("git", ["add", "-A"]);
  run("git", [
    "-c",
    "user.name=nocodeuse-dev",
    "-c",
    "user.email=261329542+nocodeuse-dev@users.noreply.github.com",
    "commit",
    "-m",
    `Release ${tag}`
  ]);
  run("git", ["push", "origin", "main"]);
  run("git", ["tag", tag]);
  run("git", ["push", "origin", tag]);

  const runId = findReleaseRun(tag);
  run("gh", ["run", "watch", runId, "--repo", REPOSITORY, "--exit-status"]);
  verifyReleaseAssets(tag);
  run("npm", ["run", "install:github", "--", "--tag", tag]);

  console.log(`Published ${tag}, installed it from GitHub, and reloaded memos-plus.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
