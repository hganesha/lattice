# Studio localization

The Studio uses React Intl/FormatJS with `en-US` as the source language. `es-ES` is the first translated catalog, and `en-XA` is a deliberately expanded pseudo-locale for visual QA.

## Authoring messages

- Add interface copy to `apps/studio/src/i18n/messages.ts` with a stable ID, a source message, and a description when context is not obvious.
- Add the matching Spanish value to `apps/studio/src/i18n/es-ES.ts`. TypeScript requires the translated catalog to contain every source key.
- Render copy through `useMessages()`. Use its date, time, number, and ICU plural formatting instead of calling `toLocaleString` directly.
- Run `pnpm --filter @lattice/studio i18n:check`. This extracts `apps/studio/lang/en-US.json` and verifies that the catalog compiles.

## Translation boundary

Interface instructions, actions, labels, empty states, and client-authored validation messages belong in the catalog. Contract names, ontology labels, competency questions, source identifiers, evidence payloads, review rationale, and other user-authored content retain their authored language. Connector/runtime services should eventually return stable message codes when their diagnostics need a localized UI presentation; raw backend messages remain diagnostic data.

## QA

Use **Appearance → Language → Pseudo** to expose missed strings and stress layouts. Verify each route at default and large text scales in both light and dark themes. English and Spanish are left-to-right; adding an RTL language requires logical CSS properties, mirrored graph/navigation affordances, and an RTL visual regression pass before it can be declared supported.
