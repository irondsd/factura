// Vendors carry no color in the DB; the design assigns each a warm, muted hue.
// Colors are computed per-apartment from a shared palette: each apartment gets its
// own deterministic assignment, so the same vendor shows up in different colors
// across apartments, and no two vendors in one apartment collide (until the palette
// is exhausted). Pure (no React) so both the server (aggregation) and client
// (charts/legends) can import it.

// Warm/muted earthy palette. Order matters only as the base sequence; each
// apartment shuffles it with its own seed.
export const VENDOR_PALETTE: string[] = [
  '#d9480f', // burnt orange
  '#c98a1a', // amber
  '#7d8471', // sage
  '#9a8c74', // taupe
  '#6b5a45', // lighter earth
  '#5f7470', // slate teal
  '#4a4034', // dark earth
  '#a8501f', // rust
  '#8a6d3b', // ochre
  '#6f7d52', // olive
  '#9c6b4f', // terracotta
  '#807356', // khaki
  '#b08968', // clay
  '#5c6b5d', // moss
]

export const FALLBACK_COLOR = 'var(--muted)'

/** Deterministic 32-bit string hash (FNV-1a style). */
function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Mulberry32 PRNG — small, deterministic, seeded. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Return a copy of `arr` shuffled deterministically from `seed`. */
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const out = arr.slice()
  const rand = mulberry32(seed)
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Assign each vendor a palette color, grouped by apartment. Each apartment's
 * palette is shuffled with a seed derived from its `propertyId`, then assigned to
 * its vendors in a stable order (by `createdAt`, then `id`), cycling if there are
 * more vendors than colors. Pure and deterministic: identical on server & client.
 */
export function vendorColorMap(
  vendors: { id: string; propertyId: string; createdAt?: Date | string }[],
): Map<string, string> {
  const byProperty = new Map<string, typeof vendors>()
  for (const v of vendors) {
    const list = byProperty.get(v.propertyId)
    if (list) list.push(v)
    else byProperty.set(v.propertyId, [v])
  }

  const colors = new Map<string, string>()
  for (const [propertyId, list] of byProperty) {
    const palette = seededShuffle(VENDOR_PALETTE, hashString(propertyId))
    const ordered = list.slice().sort((a, b) => {
      const at = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0
      if (at !== bt) return at - bt
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })
    ordered.forEach((v, i) => {
      colors.set(v.id, palette[i % palette.length])
    })
  }
  return colors
}
