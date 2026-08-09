/**
 * A colour per domain group.
 *
 * A lane canvas rendered in one colour is a wall of identical cards: the domain group a type
 * belongs to is the most useful thing to know at a glance, and reading it meant reading the lane
 * header every time. Colour carries it instead.
 *
 * Colour is never the only signal. Every lane keeps its label, every node its name, and the
 * canvas carries a legend, so a viewer who cannot separate these hues loses only the shortcut.
 */

export interface DomainGroupColor {
  /** Line work and text on a soft background. */
  accent: string
  /** Fill behind an icon or a lane header. */
  soft: string
}

/**
 * The shared categorical ramp, not a local palette.
 *
 * This was twelve HSL hues at a single lightness (`hsl(H 62% 42%)`). Equal-lightness wheels always
 * collapse under colour-vision deficiency, because hue is then the only channel carrying the
 * distinction: measured worst-case pairwise separation was 6 (of ~440 possible) under simulated
 * deuteranopia. The eight `--cat-*` tokens stagger lightness as well as hue and measure 69 light /
 * 92 dark — an order of magnitude better, at the cost of repeating after eight groups rather than
 * twelve. Eight separable colours beat twelve that several viewers cannot tell apart, and the
 * labels and legend still carry the meaning regardless. See docs/token-audit.md.
 */
const DOMAIN_GROUP_TONES = ['cat-1', 'cat-2', 'cat-3', 'cat-4', 'cat-5', 'cat-6', 'cat-7', 'cat-8'] as const

function colorForTone(tone: string): DomainGroupColor {
  return {
    accent: `var(--${tone})`,
    // A mix rather than a solid tint, so one value reads on a light or a dark surface.
    soft: `color-mix(in oklab, var(--${tone}) 16%, transparent)`,
  }
}

/**
 * Assigns colours across the groups present, in the order the layout lays them out.
 *
 * Deriving the hue from a hash of the name was the obvious alternative and was worse in practice:
 * with fifteen groups it collapsed to seven distinct colours, and nothing stopped two neighbouring
 * lanes drawing the same one — which is precisely where the distinction has to hold. Assigning by
 * position guarantees neighbours differ, and the palette only repeats once a canvas has more
 * groups than hues, by which point the lanes sharing a hue are far apart.
 */
export function domainGroupPalette(groupLabels: readonly string[]): Map<string, DomainGroupColor> {
  const palette = new Map<string, DomainGroupColor>()
  let assigned = 0
  for (const label of groupLabels) {
    const key = normalize(label)
    if (palette.has(key)) continue
    palette.set(key, colorForTone(DOMAIN_GROUP_TONES[assigned % DOMAIN_GROUP_TONES.length] ?? DOMAIN_GROUP_TONES[0]))
    assigned += 1
  }
  return palette
}

/** Falls back to a neutral rather than inventing a colour for a group the palette never saw. */
export function colorFrom(palette: Map<string, DomainGroupColor>, group: string): DomainGroupColor {
  return palette.get(normalize(group)) ?? { accent: 'var(--border-default)', soft: 'var(--bg-hover)' }
}

function normalize(group: string): string {
  return group.trim().toLocaleLowerCase() || 'ungrouped'
}
