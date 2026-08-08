Lattice Overview
Lattice is an industry-neutral context compiler for governed AI and automation. It transforms natural-language questions, combined with published Context Contracts, into explicit, auditable outcomes: signed execution plans, clarification requests, approval requirements, or evidence-backed abstentions
README.md
#1-8
Lattice is ontology-first. It establishes a stable foundation of cross-industry concepts (Person, Organization, Asset, etc.) which are then composed into versioned industry-specific workspaces
README.md
#10-12
Core Value Proposition
Lattice serves as a governed context plane between human intent and enterprise action
docs/architecture.md
#9-11
 Its primary strengths include:
Deterministic Governance: Moves beyond probabilistic AI by enforcing risk-aware gates, policy-driven evidence, and freshness checks 
README.md
#16-17
Source Binding: Connects ontology properties to external data systems (Databricks, Snowflake, PostgreSQL, etc.) without storing credentials or coupling semantics to specific vendor SDKs
docs/architecture.md
#53-55
Trust Boundary: The Context API acts as a secure boundary, verifying OIDC identities, signing plans with Ed25519, and managing immutable audit trails 
docs/architecture.md
#41-42
The Product Loop
The Lattice lifecycle follows a continuous loop from question to auditable action. This process bridges the gap between natural language and structured code entities.
The Compilation Flow
The "Compile Path" is the core runtime sequence that evaluates a request against a contract.
Lattice Product Loop: Intent to Execution
Code Entity Space
Compiler Core [@lattice/compiler-core]
Context API [apps/api]
Natural Language Space
Resolved
Ambiguous
Insufficient
Question + Purpose
OIDC/JWKS Verification
LexicalIntentResolver / HybridIntentResolver
ContextCompiler.compile()
GuardrailPolicy Enforcement
FreshnessStatus Check
SignedExecutionPlan [Ed25519]
ClarificationContract
Evidence-backed Abstention



Sources: 
docs/architecture.md
#25-39
 
packages/contracts/src/types.ts
#30-39
README.md
#16-21
The Lifecycle Stages
Question: User submits a natural language query.
Model: The HybridIntentResolver maps the query to a CompetencyQuestion
packages/contracts/src/types.ts
#48-56
Bind: SourceBinding connects entities to ConnectorProvider resources like POSTGRESQL or DATABRICKS 
packages/contracts/src/types.ts
#140-164
Policy: RiskTier (e.g., OPERATIONAL_ACTION) determines the required ApprovalStatus and EvidenceStrength 
packages/contracts/src/types.ts
#1-29
Review: Changes to ontologies or contracts undergo a review process resulting in immutable artifacts.
Assure: Deterministic gates verify the contract against AssuranceStore runs.
Publish: Contracts move to PUBLISHED status, creating a version-pinned snapshot
packages/contracts/src/types.ts
#25
Compile: The ContextCompiler generates a plan or requests clarification.
Verify: Downstream executors verify the SignedExecutionPlan signature and VersionPin
packages/contracts/src/types.ts
#40-46
Act: The plan is executed via the executeBindings adapter.
Audit: Receipts are stored in the ExecutionStore.
Monorepo Structure
Lattice is managed as a pnpm monorepo, separating core logic from implementation apps.

Package / App	Purpose
apps/api	The Express-style HTTP server and trust boundary.
apps/studio	The React-based visual authoring environment.
apps/mcp-server	Model Context Protocol implementation for AI agents.
packages/contracts	Central type definitions and industry ontologies.
packages/compiler-core	The deterministic resolution engine.
packages/importer-core	Schema translation (OpenAPI, RDF, CSV) into proposals.
packages/exporter-core	OWL/RDF serialization for ontology portability.
Sources: 
pnpm-lock.yaml
#18-191
 
README.md
#16-21
System Mapping: Code to Logic
This diagram maps high-level system components to their specific code implementations and locations.
System Component Mapping
Core Logic [packages/]
Studio Modules [apps/studio]
Registry & Storage
Saves to
Persists via
Persists via
Uses
Configures
Generates
ContractRegistry [apps/api]
SupabaseRegistryStorage [apps/api]
RegistryStorage (Local)
OntologyBuilder (React Flow)
SourceBindingStudio
PolicyStudio
ContextCompiler [@lattice/compiler-core]
types.ts [@lattice/contracts]
OpenAPI/JSON Translator [@lattice/importer-core]



Sources: 
docs/architecture.md
#5-8
 
README.md
#20-21
apps/studio/package.json
#16-27
Child Pages
For detailed technical documentation, refer to the following sub-pages:
Getting Started: Prerequisites (Node 22, pnpm), environment variables (e.g., LATTICE_API_URL, LATTICE_OIDC_ISSUER), and local development setup.
Repository Structure: Detailed breakdown of the monorepo layout, package dependencies, and the purpose of each directory.
Sources: 
README.md
#23-54
 
package.json
#1-22

