import type { ContextContract, IndustryOntology, IndustryWorkspace } from '@lattice/contracts'
import { OntologyBuilder } from './OntologyBuilder'

interface WorkspaceOntologyStudioProps {
  workspace: IndustryWorkspace
  seedContract: ContextContract
  onWorkspaceDraftChange: (workspace: IndustryWorkspace) => void
  onDirtyChange: (dirty: boolean) => void
}

export function WorkspaceOntologyStudio({ workspace, seedContract, onWorkspaceDraftChange, onDirtyChange }: WorkspaceOntologyStudioProps) {
  function updateOntology(contract: ContextContract) {
    onWorkspaceDraftChange({
      ...workspace,
      ontology: {
        ...workspace.ontology,
        entityTypes: contract.entityTypes,
        relationshipTypes: contract.relationshipTypes,
        schemaLayout: contract.schemaLayout ?? {},
      },
    })
  }

  return <OntologyBuilder contract={contractFromOntology(seedContract, workspace.ontology)} mode="workspace" exportDocument={workspace.ontology} onChange={updateOntology} onDirtyChange={onDirtyChange} />
}

function contractFromOntology(contract: ContextContract, ontology: IndustryOntology): ContextContract {
  return {
    ...contract,
    name: ontology.name,
    description: ontology.description,
    domain: ontology.domain,
    version: ontology.version,
    releaseStatus: ontology.releaseStatus,
    digest: ontology.digest,
    entityTypes: structuredClone(ontology.entityTypes),
    relationshipTypes: structuredClone(ontology.relationshipTypes),
    schemaLayout: structuredClone(ontology.schemaLayout),
  }
}
