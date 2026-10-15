/** A replay (daily / weekly / monthly) as the Today hero and the story player see it. */
export type Stub = { period: "daily" | "weekly" | "monthly"; id: string; hash: string; title: string; label: string; net: number; trades: number };

/** localStorage key that remembers which version of a replay you've watched. */
export function seenKey(id: string) {
  return `ltj:seen:${id}`;
}
