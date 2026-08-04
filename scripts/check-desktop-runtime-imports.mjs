import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const bundle = await readFile(join(root, "main.js"), "utf8");

if (/import\(["']node:child_process["']\)/u.test(bundle)) {
  throw new Error("main.js must not contain a browser-style dynamic import for node:child_process");
}

if (!/require\(["']node:child_process["']\)/u.test(bundle)) {
  throw new Error("main.js must retain the guarded CommonJS require for node:child_process");
}

console.log("Desktop runtime import check passed");
