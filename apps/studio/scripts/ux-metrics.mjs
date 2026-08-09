#!/usr/bin/env node
/**
 * UX design-system burn-down metrics (see sota-ux-plan.md §6).
 *
 * Every claim in the plan is a number this script can track, so each migration
 * phase proves what it changed. Run with --check to fail CI on regression.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')

/** Files still permitted to carry legacy debt, with their current allowance. */
const BUDGET = {
  hexLiterals: 0,
  important: 20,
  subTwelvePx: 0,
  // A declaration in @layer surfaces that @layer overrides re-declares for the
  // SAME selector can never take effect: layer order beats specificity, always.
  // These are pure confusion — you edit the value and nothing moves.
  //
  // Exact selector matching is the whole test. A theme- or state-guarded rule
  // like `:root[data-theme="light"] .x` is a different selector string, applies
  // only sometimes, and must not count — treating it as a shadow deletes a
  // declaration the other theme still needs.
  shadowedByOverrides: 0,
}

/** tokens.css is the one place raw hex is legitimate — it defines the palette. */
const TOKEN_FILES = new Set(['tokens.css'])

const cssFiles = readdirSync(srcDir).filter((f) => f.endsWith('.css'))

let hexLiterals = 0
let important = 0
let subTwelvePx = 0
const perFile = []

for (const file of cssFiles) {
  // Comments explain the rules; they must not count as violations of them.
  const css = readFileSync(join(srcDir, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

  const hex = TOKEN_FILES.has(file) ? [] : (css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [])
  const bang = css.match(/!important/g) ?? []

  // Every px value appearing in a `font-size:` or `font:` shorthand declaration.
  const sizes = (css.match(/(?:font-size|font)\s*:[^;{}]*/g) ?? [])
    .flatMap((decl) => decl.match(/[0-9.]+px/g) ?? [])
    .filter((px) => Number.parseFloat(px) < 12)

  hexLiterals += hex.length
  important += bang.length
  subTwelvePx += sizes.length

  if (hex.length || bang.length || sizes.length) {
    perFile.push({ file, hex: hex.length, important: bang.length, small: sizes.length })
  }
}

/** Comma-split a selector list, ignoring commas nested inside :where()/:is(). */
function splitSelectorList(selector) {
  const parts = []
  let depth = 0
  let current = ''
  for (const ch of selector) {
    if (ch === '(') depth += 1
    else if (ch === ')') depth -= 1
    if (ch === ',' && depth === 0) { parts.push(current); current = '' }
    else current += ch
  }
  parts.push(current)
  return parts.map((p) => p.trim()).filter(Boolean)
}

/** Declarations that @layer overrides makes unreachable. */
function shadowedDeclarations() {
  const parse = (css) => {
    const map = new Map()
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const head = m[1].trim().split('\n').pop().trim()
      if (head.startsWith('@') || head === 'from' || head === 'to' || !head) continue
      const props = new Set()
      for (const decl of m[2].split(';')) {
        const key = decl.split(':')[0]?.trim()
        if (key && !key.startsWith('--') && decl.includes(':')) props.add(key)
      }
      for (const sel of splitSelectorList(head)) {
        const key = sel.trim()
        if (!key) continue
        if (!map.has(key)) map.set(key, new Set())
        for (const p of props) map.get(key).add(p)
      }
    }
    return map
  }
  const read = (f) => readFileSync(join(srcDir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const layerOf = (f) => read(f).match(/@layer\s+([a-z]+)\s*\{/)?.[1]
  const overrideFiles = cssFiles.filter((f) => layerOf(f) === 'overrides')
  const surfaceFiles = cssFiles.filter((f) => layerOf(f) === 'surfaces')
  const overrides = new Map()
  for (const f of overrideFiles) {
    for (const [sel, props] of parse(read(f))) {
      if (!overrides.has(sel)) overrides.set(sel, new Set())
      for (const p of props) overrides.get(sel).add(p)
    }
  }
  let count = 0
  for (const f of surfaceFiles) {
    for (const [sel, props] of parse(read(f))) {
      const shadow = overrides.get(sel)
      if (!shadow) continue
      for (const p of props) if (shadow.has(p)) count += 1
    }
  }
  return count
}

const rows = [
  ['Hex literals outside tokens.css', hexLiterals, BUDGET.hexLiterals],
  ['!important declarations', important, BUDGET.important],
  ['Font sizes below 12px', subTwelvePx, BUDGET.subTwelvePx],
  ['Declarations shadowed by overrides', shadowedDeclarations(), BUDGET.shadowedByOverrides],
]

console.log('\n  Lattice UX burn-down\n')
for (const [label, actual, budget] of rows) {
  const ok = actual <= budget
  console.log(`  ${ok ? '✓' : '✗'} ${label.padEnd(34)} ${String(actual).padStart(4)}  (budget ${budget})`)
}

if (perFile.length) {
  console.log('\n  Remaining by file:\n')
  perFile.sort((a, b) => b.hex + b.important + b.small - (a.hex + a.important + a.small))
  for (const r of perFile) {
    console.log(`    ${r.file.padEnd(26)} hex ${String(r.hex).padStart(3)}   !important ${String(r.important).padStart(3)}   <12px ${String(r.small).padStart(3)}`)
  }
}
console.log('')

if (process.argv.includes('--check')) {
  const failed = rows.filter(([, actual, budget]) => actual > budget)
  if (failed.length) {
    console.error(`  ${failed.length} metric(s) over budget.\n`)
    process.exit(1)
  }
}
