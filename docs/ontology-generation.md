# Form-schema ontology generation

Lattice deterministically derives shared industry ontologies from the implemented form schemas in `../Schemas`. The generator intentionally does not create one ontology per form. It consolidates repeated fields into canonical industry concepts, then adds governed relationships between those concepts.

## Run it

```bash
pnpm generate:ontologies
```

The command reads every available `fields.json`, writes the typed catalog to `packages/contracts/src/generatedIndustryOntologies.ts`, and writes a reviewable coverage report to `docs/generated-ontology-report.json`.

## Inference policy

- Industry entity definitions and field-pattern rules are explicit and reviewable in `scripts/generate-industry-ontologies.mjs`.
- Repeated source fields become governed properties on canonical entities.
- Source types are normalized to Lattice data types.
- Identifier-like fields are marked without inventing source values.
- Every entity and property records the forms that contributed it.
- Unmapped fields remain listed in provenance and the coverage report; they are never silently discarded from the audit trail.
- Generated concepts start as `DRAFT` and `TEMPLATE_DERIVED`. Human governance is required before publication.

The registry seeds missing industry workspaces from this catalog and merges a new generator digest once. Existing user-authored concepts are preserved. A saved workspace ontology is not overwritten again unless the generated artifact digest changes.
