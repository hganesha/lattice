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
 * Hues far enough apart to stay distinguishable, at a lightness that holds contrast in both
 * themes. Deliberately excludes the accent green, which already means "selected".
 */
const DOMAIN_GROUP_HUES = [210, 32, 268, 340, 174, 96, 14, 240, 128, 58, 300, 190] as const

function colorForHue(hue: number): DomainGroupColor {
  return {
    accent: `hsl(${hue} 62% 42%)`,
    // Alpha rather than a solid tint, so one value reads on a light or a dark surface.
    soft: `hsl(${hue} 62% 48% / 0.16)`,
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
    palette.set(key, colorForHue(DOMAIN_GROUP_HUES[assigned % DOMAIN_GROUP_HUES.length] ?? DOMAIN_GROUP_HUES[0]))
    assigned += 1
  }
  return palette
}

/** Falls back to a neutral rather than inventing a colour for a group the palette never saw. */
export function colorFrom(palette: Map<string, DomainGroupColor>, group: string): DomainGroupColor {
  return palette.get(normalize(group)) ?? { accent: 'var(--border-strong)', soft: 'var(--surface-soft)' }
}

function normalize(group: string): string {
  return group.trim().toLocaleLowerCase() || 'ungrouped'
}
