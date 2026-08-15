/**
 * FNV-1a 32-bit: a stable, well-distributed string hash. Used to seed
 * deterministic per-vehicle values (auction windows, photo picks) from ids
 * so they survive reloads without any stored state.
 */
export function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
