export interface ObsidianCommandInfo {
  id: string;
  name: string;
}

export function findExcalidrawEmbedCommand(commands: ObsidianCommandInfo[]): ObsidianCommandInfo | null {
  const candidates = commands
    .filter((command) => commandMatchesExcalidrawEmbed(command))
    .map((command) => ({ command, score: scoreExcalidrawEmbedCommand(command) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.command.name.localeCompare(right.command.name));
  return candidates[0]?.command ?? null;
}

function commandMatchesExcalidrawEmbed(command: ObsidianCommandInfo): boolean {
  const haystack = `${command.id} ${command.name}`.toLowerCase();
  return haystack.includes("excalidraw") && (haystack.includes("embed") || haystack.includes("嵌入"));
}

function scoreExcalidrawEmbedCommand(command: ObsidianCommandInfo): number {
  const haystack = `${command.id} ${command.name}`.toLowerCase();
  let score = 0;
  if (haystack.includes("excalidraw")) score += 2;
  if (haystack.includes("embed") || haystack.includes("嵌入")) score += 4;
  if (
    haystack.includes("new drawing") ||
    haystack.includes("new") ||
    haystack.includes("create") ||
    haystack.includes("新建绘图") ||
    haystack.includes("新建")
  ) {
    score += 3;
  }
  if (haystack.includes("markdown")) score += 2;
  if (haystack.includes("current") || haystack.includes("当前")) score += 1;
  return score;
}
