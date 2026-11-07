// ILIKE treats % and _ as wildcards — escape them so "a_b@x.ch" can't match
// a different account like "axb@x.ch" (and "%" can't match every account).
// Use for every case-insensitive email lookup via .ilike(...).
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
