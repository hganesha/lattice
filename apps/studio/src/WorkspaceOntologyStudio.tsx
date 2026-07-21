import { useState } from 'react'
import type { ContextContract, IndustryOntology, IndustryWorkspace } from '@lattice/contracts'
import { API_URL } from './api'
import { OntologyBuilder } from './OntologyBuilder'

interface WorkspaceOntologyStudioProps {
  workspace: IndustryWorkspace
  seedContract: ContextContract
  onWorkspaceChange: (workspace: IndustryWorkspace) => void
  onDirtyChange: (dirty: boolean) => void
}

export function WorkspaceOntologyStudio({ workspace, seedContract, onWorkspaceChange, onDirtyChange }: WorkspaceOntologyStudioProps) {
  const [ontologyContract, setOntologyContract] = useState(() => contractFromOntology(seedContract, workspace.ontology))

  async function saveOntology(contract: ContextContract) {
    const ontology: IndustryOntology = {
      ...workspace.ontology,
      entityTypes: contract.entityTypes,
      relationshipTypes: contract.relationshipTypes,
      schemaLayout: contract.schemaLayout ?? {},
    }
    const response = await fetch(`${API_URL}/v1/workspaces/${workspace.id}/ontology`, {
      method: 'PUT',
      headers: { Authorization: 'Bearer studio-demo', 'Content-Type': 'application/json' },
      body: JSON.stringify({ ontology }),
    })
    if (!response.ok) throw new Error(`Workspace ontology registry returned ${response.status}`)
    const updated = await response.json() as IndustryWorkspace
    onWorkspaceChange(updated)
    return { contract: contractFromOntology(seedContract, updated.ontology), updatedAt: updated.updatedAt }
  }

  return <OntologyBuilder contract={ontologyContract} mode="workspace" onChange={setOntologyContract} onDirtyChange={onDirtyChange} onSave={saveOntology} />
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
