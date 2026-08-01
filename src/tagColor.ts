export const TAG_COLOR_SLOT_COUNT = 8;

export function tagColorSlot(tag: string): number {
  const normalized = tag.trim().toLocaleLowerCase();
  let hash = 0;
  for (const character of normalized) {
    hash = Math.imul(hash, 31) + (character.codePointAt(0) ?? 0);
  }
  return (hash >>> 0) % TAG_COLOR_SLOT_COUNT;
}
