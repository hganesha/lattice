# @lattice/studio

The Lattice **Context Studio** — the React single-page app for authoring ontologies and Context Contracts, wiring source bindings, and running the compile / assure / review / release loop against the [`@lattice/api`](../api) Context API.

For the product overview and the full monorepo instructions, see the [root README](../../README.md).

## Run it

Requires Node.js 22+ and pnpm. From the repo root:

```bash
pnpm install
pnpm build        # builds the workspace packages the studio imports
pnpm dev          # starts the API (:8787) and the studio (:5173)
```

Then open `http://127.0.0.1:5173`. The studio talks to the Context API at `http://127.0.0.1:8787` by default; override with `VITE_API_URL`.

To run just the studio dev server (assuming the workspace packages are already built):

```bash
pnpm --filter @lattice/studio dev
```

### Scripts

| Script | Purpose |
|---|---|
| `pnpm dev` | Vite dev server on `127.0.0.1:5173`. |
| `pnpm build` | `tsc -b` type build + `vite build` into `dist/`. |
| `pnpm typecheck` | Type-only build (`tsc -b --pretty false`). |
| `pnpm test` | Component/unit tests (Vitest). |
| `pnpm test:e2e` | Playwright end-to-end suite (builds core + API first). |
| `pnpm i18n:check` | Extract and compile the source message catalog. |

## Layout

Each governed surface is its own top-level component, composed by the shell in `App.tsx`:

```text
src/
  App.tsx                    Shell, sidebar navigation, theme/locale/text-size switches
  OntologyBuilder.tsx        Draggable ontology canvas + entity/relationship inspector
  WorkspaceOntologyStudio.tsx  Shared workspace ontology authoring
  NewContractWizard.tsx      Blank / industry-starter contract creation with concept scope
  ImportStudio.tsx           OpenAPI / JSON Schema import with collision review
  SourceBindingStudio.tsx    Contract-level source bindings
  PolicyStudio.tsx           Per-risk-tier policy profiles
  AssuranceStudio.tsx        Deterministic contract gates + evidence traces
  ReviewQueueStudio.tsx      Governance review submission and decisions
  EvidenceRegistryStudio.tsx Provenance artifact registry
  ReleaseManagementStudio.tsx  Immutable releases, diffs, restore, runtime suspension
  RuntimeStudio.tsx          Question compilation against a published release
  icons.tsx                  Inlined Lucide nav/UI icons (1em, currentColor, CSP-safe)
  entityIcons.tsx            Entity-type icon catalog + <EntityIcon> renderer
  EntityIconPicker.tsx       Grid picker for choosing an entity type's icon
  i18n/messages.ts           Message catalog and useMessages() hook
  appearance.css             Design tokens (type ramp, spacing, radius, z-index, colors)
  styles.css                 Component styles
```

## Entity-type icons

Entity types render a real icon rather than a two-letter code. The catalog and renderer live in [`src/entityIcons.tsx`](src/entityIcons.tsx):

- `ENTITY_ICONS` — the ordered, pickable catalog (each entry is `{ id, label, Icon }`), rendered by [`EntityIconPicker`](src/EntityIconPicker.tsx) in both the create-entity dialog and the inspector.
- `EntityIcon` — renders an entity type's icon by its stored key. Persisted contracts store the catalog `id` (e.g. `"person"`, `"organization"`) in `EntityTypeDefinition.icon`. Unknown values fall back to rendering the string as a monospace glyph, so legacy two-letter codes still display until re-picked.
- `DEFAULT_ENTITY_ICON` — used when no icon is chosen (imported types, blank starters).

Icons are inlined Lucide SVGs on a 24×24 grid, sized in `em` and stroked with `currentColor` so they inherit surrounding font size and color — no runtime icon dependency and CSP-safe.

Seeded ontologies carry appropriate icons: the hand-authored packs in [`@lattice/contracts`](../../packages/contracts/src) set catalog keys directly, and the generated industry ontologies get theirs from the `ICON_KEYS` map in [`scripts/generate-industry-ontologies.mjs`](../../scripts/generate-industry-ontologies.mjs) (re-run `pnpm generate:ontologies` after changing it).

The app icon is a theme-adaptive lattice favicon at [`public/favicon.svg`](public/favicon.svg), linked from [`index.html`](index.html).

## Theming, locales, accessibility

- **Theme & text size** — sun/moon and text-size switches in the header toggle light/dark and normal/large scale; both persist in the browser. Colors and the type ramp are tokenized in `appearance.css`.
- **Locales** — ships `en-US` (source), `es-ES`, and a runtime pseudo-locale `en-XA`. Dates, numbers, and plurals follow the active locale. User-authored content and server evidence are treated as source data, not translated. See [`docs/localization.md`](../../docs/localization.md).

## Tests

- **Unit/component** — Vitest specs live next to their components (`*.test.tsx`). Run with `pnpm test`.
- **End-to-end** — Playwright specs under `e2e/`, run with `pnpm test:e2e` (builds the core packages and API first).
