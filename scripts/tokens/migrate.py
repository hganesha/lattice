#!/usr/bin/env python3
"""Migrate a studio CSS surface off the tokens.css compatibility block.

Encodes the mapping rules derived by hand on surface-kit.css and styles.css.
Run with --dry to print decisions without writing.
"""
import re, sys, os

# --- 1. unambiguous renames, longest name first ---------------------------
RENAME = [
 ('--text-secondary','--fg-secondary'), ('--text-muted','--fg-muted'),
 ('--surface-raised','--bg-raised'),    ('--surface-soft','--bg-hover'),
 ('--canvas-grid','--graph-grid'),
 ('--accent-contrast','--brand-fg-on-fill'),
 ('--success-strong','--status-success-fg'), ('--warning-strong','--status-warning-fg'),
 ('--danger-strong','--status-danger-fg'),
 ('--success-soft','--status-success-bg'),   ('--warning-soft','--status-warning-bg'),
 ('--danger-soft','--status-danger-bg'),     ('--info-soft','--status-info-bg'),
 ('--governance-soft','--status-governance-bg'), ('--selection-soft','--interactive-bg'),
 ('--success','--status-success-fg'), ('--warning','--status-warning-fg'),
 ('--danger','--status-danger-fg'),   ('--info','--status-info-fg'),
 ('--governance','--status-governance-fg'),
 ('--selection','--focus-ring'), ('--focus','--focus-ring'),
 ('--surface','--bg-surface'), ('--sidebar','--bg-subtle'), ('--canvas','--bg-canvas'),
 ('--panel','--bg-surface'), ('--line','--border-subtle'), ('--muted','--fg-muted'),
 ('--bg','--bg-canvas'), ('--text','--fg-default'),
 ('--ui-body-size','--text-body'), ('--ui-meta-size','--text-meta'),
 ('--ui-font-min','--text-meta'),
 ('--text-xs','--text-meta'), ('--text-sm','--text-support'), ('--text-base','--text-body'),
 ('--text-lg','--text-subtitle'), ('--text-xl','--text-title'), ('--text-2xl','--text-headline'),
 ('--ease','--ease-out'),
]

# --- 2. --accent resolution by selector semantics --------------------------
BRAND_SEL = re.compile(r'^(body|\.auth-shell|\.auth-mark|\.release\b|\.gov-button\.primary'
                       r'|[^{]*\.brand-mark|\.import-header|\.binding-editor-header'
                       r'|\.enterprise-use-case>aside|\.runtime-readiness'
                       r'|[^{]*[-.]lime\b)')
SUCCESS_RE = re.compile(r'healthy|ready|valid|compatible|complete|success|approved|verified'
                        r'|\bpass\b|\.active-release')
STATE_RE   = re.compile(r'\.selected|\.active|\.current|\.on\b|:hover|:focus|\.highlighted'
                        r'|\.linked|\.featured|\[aria-pressed="true"\]')
# value text only — bare b/dd/em/strong. `span`/`small` are usually badges, not values.
EMPHASIS_RE = re.compile(r'(?:^|[\s>])(?:b|dd|em|strong)\s*$')

# A colour used as TEXT must be the ramp's text step (11); step 9 is a fill and
# measures 2.97:1 as light-mode text on its own soft background. Anything used as
# a fill, border, stroke or control accent takes step 9.
TEXT_PROP = re.compile(r'^\s*(?:color|stroke|fill|-webkit-text-fill-color)\s*:')

FAMILY = {
  'success': ('--status-success-fg', '--status-success-solid', '--status-success-bg'),
  'brand':   ('--brand-text',        '--brand-fill',           '--brand-bg'),
  'interact':('--interactive-text',  '--interactive-fill',     '--interactive-bg'),
  'focus':   ('--focus-ring',        '--focus-ring',           '--interactive-bg'),
  'neutral': ('--fg-default',        '--border-default',       '--bg-hover'),
}

def accent_family(sel, decl):
    s = sel.strip()
    if 'accent-color' in decl:   return 'interact'
    if SUCCESS_RE.search(s):     return 'success'
    if BRAND_SEL.match(s):       return 'brand'
    if ':focus' in s:            return 'focus'
    if STATE_RE.search(s):       return 'interact'
    if EMPHASIS_RE.search(s):    return 'neutral'
    return 'interact'

def accent_token(sel, decl, kind):
    """kind: 'soft' | 'strong' | 'base'"""
    text, fill, bg = FAMILY[accent_family(sel, decl)]
    if kind == 'soft': return bg
    return text if TEXT_PROP.match(decl) else fill

def migrate(path, dry=False):
    src = open(path).read(); s = src; log = []
    for a,b in RENAME:
        s = s.replace('var(%s)'%a, 'var(%s)'%b)

    def rule(m):
        head, body = m.group(1), m.group(2)
        if 'var(--accent' not in body: return m.group(0)
        sel = head.strip().splitlines()[-1].strip()
        out = []
        for d in body.split(';'):
            if 'var(--accent' in d:
                tk = accent_token(sel, d, 'strong')
                d2 = d.replace('var(--accent-soft)',   'var(%s)' % accent_token(sel, d, 'soft'))
                d2 = d2.replace('var(--accent-strong)','var(%s)' % tk)
                d2 = d2.replace('var(--accent)',       'var(%s)' % tk)
                log.append((sel, d.strip()[:44],
                            accent_token(sel, d, 'soft') if '-soft' in d else tk))
                out.append(d2)
            else: out.append(d)
        return head + '{' + ';'.join(out) + '}'
    s = re.sub(r'([^{}]+)\{([^{}]*)\}', rule, s)

    # --- 3. borders by job ---------------------------------------------------
    ctl = re.compile(r'((?:^|[,{])\s*[^{}]*?(?:input|textarea|select|button)[^{}]*?\{[^{}]*?)'
                     r'var\(--border-strong\)')
    prev = None
    while prev != s:
        prev = s; s = ctl.sub(lambda m: m.group(1)+'var(--border-control)', s, count=1)
    s = re.sub(r'(border-(?:top|bottom|left|right)\s*:[^;}]*?)var\(--border(?:-strong)?\)',
               r'\1var(--border-subtle)', s)
    s = s.replace('var(--border-strong)','var(--border-default)')
    s = s.replace('var(--border)','var(--border-default)')

    # --- 4. fonts and hardcoded sizes ---------------------------------------
    s = s.replace("'DM Mono'", 'var(--font-mono)').replace('DM Mono','var(--font-mono)')
    s = s.replace('Manrope','var(--font-display)')
    s = re.sub(r'Inter\s*,\s*sans-serif','var(--font-sans)', s)
    s = re.sub(r'(?<![-\w])Inter(?![-\w)])','var(--font-sans)', s)
    s = re.sub(r'var\(--font-mono\)\s*,\s*monospace','var(--font-mono)', s)
    s = re.sub(r'var\(--font-display\)\s*,\s*sans-serif','var(--font-display)', s)
    SIZE = {'11px':'var(--text-micro)','12px':'var(--text-meta)','13px':'var(--text-support)',
            '14px':'var(--text-body)','15px':'var(--text-subtitle)','16px':'var(--text-subtitle)',
            '17px':'var(--text-subtitle)','18px':'var(--text-subtitle)','19px':'var(--text-title)',
            '20px':'var(--text-title)','22px':'var(--text-headline)','23px':'var(--text-headline)',
            '24px':'var(--text-headline)','25px':'var(--text-headline)','28px':'var(--text-display)'}
    s = re.sub(r'(font:\s*(?:\d+\s+)?)(\d+px)(\s*(?:/[\d.]+)?\s*var\(--font-)',
               lambda m: m.group(1)+SIZE.get(m.group(2), m.group(2))+m.group(3), s)

    # --- 5. srgb -> oklab for perceptually even mixes ------------------------
    s = s.replace('color-mix(in srgb,', 'color-mix(in oklab,').replace('color-mix(in srgb ', 'color-mix(in oklab ')

    if not dry and s != src: open(path,'w').write(s)
    return log, s != src

if __name__ == '__main__':
    dry = '--dry' in sys.argv
    SKIP = {'tokens.css', 'layers.css'}   # token defs and @import URLs are not surfaces
    files = [a for a in sys.argv[1:]
             if a.endswith('.css') and os.path.basename(a) not in SKIP]
    for f in files:
        log, changed = migrate(f, dry)
        print(f"\n=== {f} {'(dry)' if dry else ''} {'changed' if changed else 'no change'}")
        for sel, decl, tok in log:
            print(f"   {sel[:46]:48} {decl:46} -> {tok}")
