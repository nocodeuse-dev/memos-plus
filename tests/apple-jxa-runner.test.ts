import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { prepareAppleJxaInvocation, runAppleJxa, type AppleJxaSpawn } from "../src/appleJxaRunner";

describe("Apple JXA process runner", () => {
  it("keeps a request larger than macOS ARG_MAX out of argv", () => {
    const request = { operation: "upsert", title: "半月板".repeat(200_000) };
    const invocation = prepareAppleJxaInvocation("function run() { return MEMOS_PLUS_REQUEST_JSON; }", request);

    expect(invocation.executable).toBe("/usr/bin/osascript");
    expect(invocation.args).toEqual(["-l", "JavaScript"]);
    expect(invocation.args.join(" ")).not.toContain("半月板");
    expect(Buffer.byteLength(invocation.input)).toBeGreaterThan(1_000_000);
    expect(invocation.input).toContain("MEMOS_PLUS_REQUEST_JSON");
  });

  it("writes the program through stdin and parses a JSON response", async () => {
    let capturedInput = "";
    const spawnProcess: AppleJxaSpawn = vi.fn((_executable, _args, options) => {
      const process = new EventEmitter() as EventEmitter & {
        stdin: PassThrough;
        stdout: PassThrough;
        stderr: PassThrough;
        kill: ReturnType<typeof vi.fn>;
      };
      process.stdin = new PassThrough();
      process.stdout = new PassThrough();
      process.stderr = new PassThrough();
      process.kill = vi.fn(() => true);
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk: string) => { capturedInput += chunk; });
      process.stdin.on("finish", () => {
        process.stdout.write(JSON.stringify({ ok: true }));
        process.stdout.end();
        queueMicrotask(() => process.emit("close", 0, null));
      });
      expect(options.env).toEqual({ PATH: "/usr/bin:/bin:/usr/sbin:/sbin", LANG: "en_US.UTF-8" });
      return process as unknown as ReturnType<AppleJxaSpawn>;
    });

    const result = await runAppleJxa<{ ok: boolean }>("function run() { return '{}'; }", { title: "测试" }, {
      timeoutMs: 1_000,
      timeoutMessage: "timeout",
      invalidResponseMessage: "invalid",
      normalizeError: (message) => message,
      spawnProcess
    });

    expect(result).toEqual({ ok: true });
    expect(spawnProcess).toHaveBeenCalledWith("/usr/bin/osascript", ["-l", "JavaScript"], expect.any(Object));
    expect(capturedInput).toContain('\\"title\\":\\"测试\\"');
  });
});
