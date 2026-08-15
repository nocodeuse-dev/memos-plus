import type { ChildProcessWithoutNullStreams } from "node:child_process";

export interface AppleJxaInvocation {
  executable: string;
  args: string[];
  input: string;
}

export type AppleJxaSpawn = (
  executable: string,
  args: string[],
  options: { env: NodeJS.ProcessEnv; stdio: ["pipe", "pipe", "pipe"] }
) => Pick<ChildProcessWithoutNullStreams, "stdin" | "stdout" | "stderr" | "once" | "kill">;

export interface AppleJxaRunOptions {
  timeoutMs: number;
  timeoutMessage: string;
  invalidResponseMessage: string;
  normalizeError: (message: string) => string;
  maxBufferBytes?: number;
  spawnProcess?: AppleJxaSpawn;
}

const DEFAULT_MAX_BUFFER_BYTES = 10 * 1024 * 1024;

/**
 * Keep both the JXA program and its request out of argv. macOS counts argv and
 * the inherited environment against ARG_MAX, so a long Markdown task can make
 * child_process fail with E2BIG before osascript even starts.
 */
export function prepareAppleJxaInvocation(script: string, request: unknown): AppleJxaInvocation {
  const requestLiteral = JSON.stringify(JSON.stringify(request) ?? "{}")
    .replace(/\u2028/gu, "\\u2028")
    .replace(/\u2029/gu, "\\u2029");
  return {
    executable: "/usr/bin/osascript",
    args: ["-l", "JavaScript"],
    input: `const MEMOS_PLUS_REQUEST_JSON = ${requestLiteral};\n${script}`
  };
}

export function runAppleJxa<T>(script: string, request: unknown, options: AppleJxaRunOptions): Promise<T> {
  const invocation = prepareAppleJxaInvocation(script, request);
  const spawnProcess = options.spawnProcess ?? loadNodeSpawn();
  const maxBufferBytes = options.maxBufferBytes ?? DEFAULT_MAX_BUFFER_BYTES;

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let stdout = "";
    let stderr = "";
    let outputBytes = 0;
    let child: ReturnType<AppleJxaSpawn>;
    try {
      child = spawnProcess(invocation.executable, invocation.args, {
        // A bounded environment prevents an unrelated oversized Electron env
        // from consuming macOS ARG_MAX before the fixed osascript argv is read.
        env: { PATH: "/usr/bin:/bin:/usr/sbin:/sbin", LANG: "en_US.UTF-8" },
        stdio: ["pipe", "pipe", "pipe"]
      });
    } catch (error) {
      reject(new Error(options.normalizeError(errorMessage(error))));
      return;
    }

    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const rejectNormalized = (message: string): void => {
      finish(() => reject(new Error(options.normalizeError(message))));
    };
    const appendOutput = (kind: "stdout" | "stderr", chunk: Buffer | string): void => {
      if (settled) return;
      const text = chunk.toString();
      outputBytes += Buffer.byteLength(text);
      if (outputBytes > maxBufferBytes) {
        child.kill("SIGTERM");
        rejectNormalized("Apple automation response exceeded the safe buffer limit");
        return;
      }
      if (kind === "stdout") stdout += text;
      else stderr += text;
    };

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish(() => reject(new Error(options.timeoutMessage)));
    }, options.timeoutMs);

    child.stdout.on("data", (chunk: Buffer | string) => appendOutput("stdout", chunk));
    child.stderr.on("data", (chunk: Buffer | string) => appendOutput("stderr", chunk));
    child.once("error", (error: Error) => rejectNormalized(error.message));
    child.once("close", (code: number | null, signal: NodeJS.Signals | null) => {
      if (settled) return;
      if (code !== 0) {
        rejectNormalized(stderr || `Apple automation exited with code ${String(code)}${signal ? ` (${signal})` : ""}`);
        return;
      }
      try {
        const response = JSON.parse(stdout.trim()) as T;
        finish(() => resolve(response));
      } catch {
        finish(() => reject(new Error(options.invalidResponseMessage)));
      }
    });
    child.stdin.once("error", (error: Error) => rejectNormalized(error.message));
    child.stdin.end(invocation.input, "utf8");
  });
}

function loadNodeSpawn(): AppleJxaSpawn {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- callers guard macOS desktop availability before invoking this helper.
  const { spawn } = require("node:child_process") as typeof import("node:child_process");
  return spawn as unknown as AppleJxaSpawn;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
