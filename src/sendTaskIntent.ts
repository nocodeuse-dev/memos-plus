import type { TemplateTaskDecision } from "./templateManager";

export type SendTaskIntent = "plain" | "default-task" | "prompt";

export function resolveSendTaskIntent(
  forceAsTask: boolean,
  templateDecision: TemplateTaskDecision,
  promptForHeadingBoundTask: boolean
): SendTaskIntent {
  if (forceAsTask) return "prompt";
  if (templateDecision === "ask" || (templateDecision === "task" && promptForHeadingBoundTask)) return "prompt";
  return templateDecision === "task" ? "default-task" : "plain";
}
