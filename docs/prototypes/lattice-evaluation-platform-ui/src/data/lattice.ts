/* ------------------------------------------------------------------ *
 * Lattice — mock domain model for the evaluation console
 * ------------------------------------------------------------------ */

export type RunStatus = "completed" | "running" | "failed" | "queued";
export type DispositionVerdict = "allowed" | "denied" | "conditioned";
export type IdentityKind = "agent" | "human" | "service";
export type Env = "Production" | "Staging";
export type Tone =
  | "neutral"
  | "brand"
  | "cyber"
  | "emerald"
  | "amber"
  | "rose"
  | "blue"
  | "violet";

export interface Dimensions {
  accuracy: number;
  policy: number;
  safety: number;
  groundedness: number;
  helpfulness: number;
  privacy: number;
}

export interface EvalRun {
  id: string;
  name: string;
  target: string;
  targetType: IdentityKind;
  contractId: string;
  status: RunStatus;
  startedAt: string;
  durationMs: number;
  samples: number;
  passRate: number; // 0..1
  score: number; // 0..100
  outliers: number;
  dimensions: Dimensions;
  trend: number[];
  env: Env;
  curator: string;
  drift: number; // vs prior, in points
}

export interface DispositionRow {
  id: string;
  compiledHash: string;
  intent: string;
  identity: string;
  identityKind: IdentityKind;
  delegation: { label: string; kind: IdentityKind }[];
  verdict: DispositionVerdict;
  evidence: string[];
  policyRef: string;
  contractId: string;
  ts: string;
  latencyMs: number;
  channel: string;
}

export interface ContextContract {
  id: string;
  name: string;
  version: string;
  standards: string[];
  coverage: number; // 0..100 semantic coverage
  scope: string;
  controls: number;
  bindings: number;
  health: "healthy" | "watch" | "degraded";
  lastEval: string;
  drift: number;
}

export interface OutlierRow {
  id: string;
  runId: string;
  sample: string;
  dimension: keyof Dimensions | string;
  target: string;
  expected: number;
  actual: number;
  severity: "critical" | "high" | "medium";
  suggestion: string;
  ts: string;
}

export interface IdentityRow {
  id: string;
  kind: IdentityKind;
  name: string;
  role: string;
  trustLevel: number; // 0..100
  posture: "verified" | "delegated" | "rotating" | "quarantined";
  evals: number;
  passRate: number;
  delegations: number;
  scope: string;
  lastSeen: string;
}

/* ---------------------------- aggregates ---------------------------- */

export const DIMENSION_LABELS: Record<keyof Dimensions, string> = {
  accuracy: "Accuracy",
  policy: "Policy Adherence",
  safety: "Safety Boundary",
  groundedness: "Groundedness",
  helpfulness: "Helpfulness",
  privacy: "PII / Privacy",
};

export const kpis = {
  posture: 94, // governance posture
  postureDelta: 2.4,
  contracts: 48,
  dispositions24h: 184320,
  passRate: 0.961,
  passDelta: 1.2,
  outliers: 137,
  outliersDelta: -18,
  p50LatencyMs: 312,
  latencyDelta: -24,
  evaluators: { human: 142, agent: 38 },
};

// 14-day trend series
export const trendSeries = [
  { d: "Apr 03", pass: 0.932, vol: 12200, disp: 142000 },
  { d: "Apr 04", pass: 0.938, vol: 13100, disp: 150400 },
  { d: "Apr 05", pass: 0.941, vol: 11800, disp: 138900 },
  { d: "Apr 06", pass: 0.939, vol: 9400, disp: 121200 },
  { d: "Apr 07", pass: 0.944, vol: 10200, disp: 133600 },
  { d: "Apr 08", pass: 0.951, vol: 14600, disp: 168200 },
  { d: "Apr 09", pass: 0.948, vol: 13900, disp: 161400 },
  { d: "Apr 10", pass: 0.955, vol: 15400, disp: 174800 },
  { d: "Apr 11", pass: 0.953, vol: 16100, disp: 179600 },
  { d: "Apr 12", pass: 0.959, vol: 12800, disp: 152300 },
  { d: "Apr 13", pass: 0.956, vol: 13400, disp: 158700 },
  { d: "Apr 14", pass: 0.962, vol: 17200, disp: 184320 },
  { d: "Apr 15", pass: 0.958, vol: 16900, disp: 181500 },
  { d: "Apr 16", pass: 0.961, vol: 17650, disp: 184320 },
];

export const postureRing = { label: "Governance Posture", value: 94 };

export const humanVsAgent = {
  dimensions: ["accuracy", "policy", "safety", "groundedness", "helpfulness", "privacy"] as (keyof Dimensions)[],
  human: [88, 96, 98, 84, 91, 95],
  agent: [94, 90, 86, 79, 93, 88],
};

export const dispositionMix = [
  { label: "Allowed", value: 0.718, tone: "emerald" as Tone },
  { label: "Conditioned", value: 0.214, tone: "amber" as Tone },
  { label: "Denied", value: 0.068, tone: "rose" as Tone },
];

export const pipelineStages = [
  { key: "intent", label: "Intent Captured", value: 184320, sub: "authorized inputs", tone: "brand" as Tone },
  { key: "identity", label: "Identity Verified", value: 183990, sub: "0.18% challenged", tone: "cyber" as Tone },
  { key: "delegation", label: "Delegation Bound", value: 182114, sub: "constraints applied", tone: "violet" as Tone },
  { key: "evidence", label: "Evidence Attached", value: 182114, sub: "cryptographic refs", tone: "blue" as Tone },
  { key: "disposition", label: "Dispositions Issued", value: 184320, sub: "auditable & deterministic", tone: "emerald" as Tone },
];

/* ---------------------------- eval runs ----------------------------- */

export const runs: EvalRun[] = [
  {
    id: "RUN-7841",
    name: "Q3 Policy Adherence Sweep",
    target: "agent:router-v4",
    targetType: "agent",
    contractId: "enterprise-policy-v3",
    status: "completed",
    startedAt: "2026-04-16T09:12:00Z",
    durationMs: 14 * 60 * 1000 + 22000,
    samples: 17650,
    passRate: 0.961,
    score: 94.2,
    outliers: 37,
    dimensions: { accuracy: 95, policy: 97, safety: 96, groundedness: 90, helpfulness: 93, privacy: 95 },
    trend: [0.92, 0.93, 0.93, 0.94, 0.935, 0.95, 0.952, 0.948, 0.956, 0.958, 0.961],
    env: "Production",
    curator: "k.holst",
    drift: 1.4,
  },
  {
    id: "RUN-7839",
    name: "Customer Data Retrieval Guardrails",
    target: "agent:resolver-prod",
    targetType: "agent",
    contractId: "gdpr-data-handling",
    status: "running",
    startedAt: "2026-04-16T10:40:00Z",
    durationMs: 6 * 60 * 1000 + 12000,
    samples: 9840,
    passRate: 0.949,
    score: 91.7,
    outliers: 22,
    dimensions: { accuracy: 92, policy: 96, safety: 95, groundedness: 88, helpfulness: 90, privacy: 97 },
    trend: [0.9, 0.91, 0.915, 0.92, 0.93, 0.928, 0.94, 0.935, 0.942, 0.946, 0.949],
    env: "Production",
    curator: "m.osei",
    drift: 0.6,
  },
  {
    id: "RUN-7836",
    name: "PII Redaction Regression",
    target: "pipeline:ingest-edge",
    targetType: "service",
    contractId: "gdpr-data-handling",
    status: "failed",
    startedAt: "2026-04-16T07:55:00Z",
    durationMs: 3 * 60 * 1000 + 40000,
    samples: 5120,
    passRate: 0.871,
    score: 76.3,
    outliers: 64,
    dimensions: { accuracy: 84, policy: 82, safety: 90, groundedness: 71, helpfulness: 78, privacy: 66 },
    trend: [0.94, 0.93, 0.92, 0.91, 0.9, 0.89, 0.88, 0.875, 0.88, 0.872, 0.871],
    env: "Staging",
    curator: "automation",
    drift: -6.8,
  },
  {
    id: "RUN-7830",
    name: "Human Resolver Calibration",
    target: "human:tier-1-ops",
    targetType: "human",
    contractId: "enterprise-policy-v3",
    status: "completed",
    startedAt: "2026-04-15T16:20:00Z",
    durationMs: 42 * 60 * 1000,
    samples: 3210,
    passRate: 0.953,
    score: 92.1,
    outliers: 14,
    dimensions: { accuracy: 88, policy: 96, safety: 98, groundedness: 84, helpfulness: 91, privacy: 95 },
    trend: [0.93, 0.932, 0.94, 0.938, 0.945, 0.948, 0.95, 0.951, 0.953],
    env: "Production",
    curator: "k.holst",
    drift: 0.9,
  },
  {
    id: "RUN-7824",
    name: "Multi-agent Router Cohort",
    target: "agent:router-v4",
    targetType: "agent",
    contractId: "safety-core-v2",
    status: "completed",
    startedAt: "2026-04-15T11:08:00Z",
    durationMs: 19 * 60 * 1000,
    samples: 22840,
    passRate: 0.974,
    score: 95.8,
    outliers: 19,
    dimensions: { accuracy: 96, policy: 95, safety: 98, groundedness: 92, helpfulness: 94, privacy: 96 },
    trend: [0.95, 0.955, 0.952, 0.96, 0.962, 0.965, 0.968, 0.97, 0.972, 0.974],
    env: "Production",
    curator: "t.bauer",
    drift: 2.1,
  },
  {
    id: "RUN-7818",
    name: "Vendor Onboarding Intent Map",
    target: "agent:procure-bot",
    targetType: "agent",
    contractId: "sox-approval-chain",
    status: "completed",
    startedAt: "2026-04-14T14:02:00Z",
    durationMs: 11 * 60 * 1000,
    samples: 6840,
    passRate: 0.933,
    score: 89.4,
    outliers: 28,
    dimensions: { accuracy: 90, policy: 94, safety: 91, groundedness: 85, helpfulness: 88, privacy: 90 },
    trend: [0.9, 0.905, 0.91, 0.915, 0.92, 0.922, 0.926, 0.93, 0.933],
    env: "Staging",
    curator: "m.osei",
    drift: -1.2,
  },
  {
    id: "RUN-7811",
    name: "Cross-tenant Isolation Probe",
    target: "pipeline:ingest-edge",
    targetType: "service",
    contractId: "isolation-tenant-boundary",
    status: "completed",
    startedAt: "2026-04-14T09:30:00Z",
    durationMs: 8 * 60 * 1000,
    samples: 14200,
    passRate: 0.988,
    score: 97.5,
    outliers: 6,
    dimensions: { accuracy: 97, policy: 99, safety: 99, groundedness: 95, helpfulness: 92, privacy: 98 },
    trend: [0.97, 0.975, 0.978, 0.98, 0.982, 0.985, 0.986, 0.988],
    env: "Production",
    curator: "automation",
    drift: 0.4,
  },
  {
    id: "RUN-7805",
    name: "Support Triage Agent v4.2",
    target: "agent:resolver-prod",
    targetType: "agent",
    contractId: "kb-groundedness-v1",
    status: "queued",
    startedAt: "2026-04-16T11:30:00Z",
    durationMs: 0,
    samples: 12000,
    passRate: 0.92,
    score: 88.6,
    outliers: 0,
    dimensions: { accuracy: 91, policy: 90, safety: 92, groundedness: 83, helpfulness: 89, privacy: 88 },
    trend: [0.9, 0.905, 0.91, 0.912, 0.916, 0.918, 0.92],
    env: "Staging",
    curator: "t.bauer",
    drift: 0,
  },
  {
    id: "RUN-7799",
    name: "Procurement Approval Chain",
    target: "human:legal-review",
    targetType: "human",
    contractId: "sox-approval-chain",
    status: "completed",
    startedAt: "2026-04-13T13:15:00Z",
    durationMs: 55 * 60 * 1000,
    samples: 1820,
    passRate: 0.966,
    score: 93.7,
    outliers: 9,
    dimensions: { accuracy: 90, policy: 98, safety: 96, groundedness: 88, helpfulness: 92, privacy: 94 },
    trend: [0.94, 0.945, 0.948, 0.952, 0.956, 0.96, 0.964, 0.966],
    env: "Production",
    curator: "k.holst",
    drift: 1.1,
  },
  {
    id: "RUN-7790",
    name: "Knowledge Base Groundedness",
    target: "agent:copilot-internal",
    targetType: "agent",
    contractId: "kb-groundedness-v1",
    status: "completed",
    startedAt: "2026-04-12T10:05:00Z",
    durationMs: 16 * 60 * 1000,
    samples: 19800,
    passRate: 0.942,
    score: 90.2,
    outliers: 41,
    dimensions: { accuracy: 93, policy: 91, safety: 89, groundedness: 86, helpfulness: 92, privacy: 90 },
    trend: [0.91, 0.915, 0.918, 0.92, 0.925, 0.93, 0.935, 0.938, 0.942],
    env: "Production",
    curator: "t.bauer",
    drift: -0.7,
  },
  {
    id: "RUN-7784",
    name: "Field Service Delegation Drill",
    target: "human:tier-1-ops",
    targetType: "human",
    contractId: "enterprise-policy-v3",
    status: "running",
    startedAt: "2026-04-16T10:58:00Z",
    durationMs: 4 * 60 * 1000,
    samples: 5400,
    passRate: 0.937,
    score: 90.9,
    outliers: 12,
    dimensions: { accuracy: 89, policy: 95, safety: 96, groundedness: 86, helpfulness: 90, privacy: 93 },
    trend: [0.91, 0.915, 0.918, 0.922, 0.928, 0.932, 0.935, 0.937],
    env: "Staging",
    curator: "m.osei",
    drift: 0.8,
  },
  {
    id: "RUN-7775",
    name: "Quarterly Safety Boundary Suite",
    target: "agent:router-v4",
    targetType: "agent",
    contractId: "safety-core-v2",
    status: "completed",
    startedAt: "2026-04-11T08:40:00Z",
    durationMs: 23 * 60 * 1000,
    samples: 26400,
    passRate: 0.981,
    score: 96.9,
    outliers: 11,
    dimensions: { accuracy: 96, policy: 97, safety: 99, groundedness: 94, helpfulness: 95, privacy: 97 },
    trend: [0.95, 0.955, 0.962, 0.966, 0.97, 0.974, 0.978, 0.981],
    env: "Production",
    curator: "k.holst",
    drift: 1.7,
  },
];

/* --------------------------- dispositions --------------------------- */

export const dispositions: DispositionRow[] = [
  {
    id: "DSP-9f3a7c",
    compiledHash: "0x8a2f…c41e",
    intent: "retrieve customer record · acct-4471",
    identity: "agent:resolver-prod",
    identityKind: "agent",
    delegation: [
      { label: "svc:edge-gw", kind: "service" },
      { label: "agent:router-v4", kind: "agent" },
      { label: "agent:resolver-prod", kind: "agent" },
    ],
    verdict: "allowed",
    evidence: ["evd:4f2a", "evd:91c0", "evd:7b3d"],
    policyRef: "POL-RET-112 · least-privilege",
    contractId: "gdpr-data-handling",
    ts: "2026-04-16 11:42:09",
    latencyMs: 286,
    channel: "realtime",
  },
  {
    id: "DSP-9f3a7b",
    compiledHash: "0x1d7e…9aab",
    intent: "export billing ledger → external",
    identity: "human:k.holst",
    identityKind: "human",
    delegation: [
      { label: "human:k.holst", kind: "human" },
      { label: "role:finance-controller", kind: "service" },
    ],
    verdict: "conditioned",
    evidence: ["evd:33fe", "evd:aa07"],
    policyRef: "POL-EXP-009 · require dual-attest",
    contractId: "sox-approval-chain",
    ts: "2026-04-16 11:41:52",
    latencyMs: 412,
    channel: "console",
  },
  {
    id: "DSP-9f3a79",
    compiledHash: "0x6c01…ff22",
    intent: "invoke model · unrestricted scope",
    identity: "agent:procure-bot",
    identityKind: "agent",
    delegation: [{ label: "agent:procure-bot", kind: "agent" }],
    verdict: "denied",
    evidence: ["evd:be19"],
    policyRef: "POL-MOD-220 · scope escalation blocked",
    contractId: "safety-core-v2",
    ts: "2026-04-16 11:40:18",
    latencyMs: 198,
    channel: "realtime",
  },
  {
    id: "DSP-9f3a76",
    compiledHash: "0x44a8…1d6c",
    intent: "read tenant config · tenant-B",
    identity: "agent:resolver-prod",
    identityKind: "agent",
    delegation: [
      { label: "svc:edge-gw", kind: "service" },
      { label: "agent:router-v4", kind: "agent" },
      { label: "agent:resolver-prod", kind: "agent" },
    ],
    verdict: "denied",
    evidence: ["evd:7c2f", "evd:0e51"],
    policyRef: "POL-ISO-004 · cross-tenant boundary",
    contractId: "isolation-tenant-boundary",
    ts: "2026-04-16 11:38:44",
    latencyMs: 221,
    channel: "realtime",
  },
  {
    id: "DSP-9f3a71",
    compiledHash: "0xb1de…7740",
    intent: "draft support reply · case-88213",
    identity: "human:tier-1-ops",
    identityKind: "human",
    delegation: [
      { label: "human:m.osei", kind: "human" },
      { label: "team:tier-1-ops", kind: "service" },
    ],
    verdict: "allowed",
    evidence: ["evd:55a3", "evd:c902", "evd:1188", "evd:fd47"],
    policyRef: "POL-DRF-058 · templated response",
    contractId: "enterprise-policy-v3",
    ts: "2026-04-16 11:36:02",
    latencyMs: 312,
    channel: "console",
  },
  {
    id: "DSP-9f3a6e",
    compiledHash: "0x39ff…a0bb",
    intent: "summarize transcript · session-5530",
    identity: "agent:copilot-internal",
    identityKind: "agent",
    delegation: [
      { label: "svc:edge-gw", kind: "service" },
      { label: "agent:copilot-internal", kind: "agent" },
    ],
    verdict: "conditioned",
    evidence: ["evd:6d21", "evd:4b9c"],
    policyRef: "POL-PII-017 · redact PII first",
    contractId: "gdpr-data-handling",
    ts: "2026-04-16 11:33:55",
    latencyMs: 268,
    channel: "realtime",
  },
  {
    id: "DSP-9f3a6a",
    compiledHash: "0x72cc…3e91",
    intent: "approve purchase order · PO-4407",
    identity: "human:legal-review",
    identityKind: "human",
    delegation: [
      { label: "human:t.bauer", kind: "human" },
      { label: "role:legal-approver", kind: "service" },
      { label: "role:finance-controller", kind: "service" },
    ],
    verdict: "allowed",
    evidence: ["evd:a14f", "evd:0c2b", "evd:e890"],
    policyRef: "POL-APR-031 · chain of custody",
    contractId: "sox-approval-chain",
    ts: "2026-04-16 11:30:11",
    latencyMs: 389,
    channel: "console",
  },
  {
    id: "DSP-9f3a65",
    compiledHash: "0xf05a…b62d",
    intent: "sync knowledge index · kb-prod",
    identity: "pipeline:ingest-edge",
    identityKind: "service",
    delegation: [{ label: "pipeline:ingest-edge", kind: "service" }],
    verdict: "allowed",
    evidence: ["evd:9d70", "evd:22fa"],
    policyRef: "POL-IDX-006 · scheduled window",
    contractId: "kb-groundedness-v1",
    ts: "2026-04-16 11:28:40",
    latencyMs: 144,
    channel: "batch",
  },
];

/* ------------------------- context contracts ------------------------ */

export const contracts: ContextContract[] = [
  {
    id: "enterprise-policy-v3",
    name: "Enterprise Policy",
    version: "v3.4.1",
    standards: ["ISO 27001", "NIST AI RMF", "SOC 2"],
    coverage: 97,
    scope: "Org-wide · 12 domains",
    controls: 64,
    bindings: 1842,
    health: "healthy",
    lastEval: "2h ago",
    drift: 0.3,
  },
  {
    id: "gdpr-data-handling",
    name: "GDPR Data Handling",
    version: "v2.1.0",
    standards: ["GDPR", "ISO 27701"],
    coverage: 93,
    scope: "EU tenants · PII classes",
    controls: 41,
    bindings: 968,
    health: "healthy",
    lastEval: "5h ago",
    drift: 0.9,
  },
  {
    id: "sox-approval-chain",
    name: "SOX Approval Chain",
    version: "v1.8.3",
    standards: ["SOX", "COBIT"],
    coverage: 89,
    scope: "Finance · procurement",
    controls: 28,
    bindings: 410,
    health: "watch",
    lastEval: "1d ago",
    drift: 2.4,
  },
  {
    id: "safety-core-v2",
    name: "Safety Core Boundaries",
    version: "v2.6.0",
    standards: ["NIST AI RMF", "EU AI Act"],
    coverage: 95,
    scope: "All agents · inference",
    controls: 52,
    bindings: 2210,
    health: "healthy",
    lastEval: "3h ago",
    drift: 0.1,
  },
  {
    id: "isolation-tenant-boundary",
    name: "Tenant Isolation Boundary",
    version: "v4.0.2",
    standards: ["ISO 27001", "SOC 2"],
    coverage: 99,
    scope: "Multi-tenant runtime",
    controls: 33,
    bindings: 1560,
    health: "healthy",
    lastEval: "8h ago",
    drift: 0.0,
  },
  {
    id: "kb-groundedness-v1",
    name: "Knowledge Groundedness",
    version: "v1.3.7",
    standards: ["NIST AI RMF"],
    coverage: 81,
    scope: "Copilot · retrieval",
    controls: 19,
    bindings: 740,
    health: "degraded",
    lastEval: "4h ago",
    drift: 5.2,
  },
];

/* ----------------------------- outliers ----------------------------- */

export const outliers: OutlierRow[] = [
  {
    id: "OL-44071",
    runId: "RUN-7836",
    sample: "S-5120",
    dimension: "privacy",
    target: "pipeline:ingest-edge",
    expected: 94,
    actual: 41,
    severity: "critical",
    suggestion: "Redaction model regressed on EU phone formats — retrain with locale samples.",
    ts: "2026-04-16 08:02",
  },
  {
    id: "OL-44068",
    runId: "RUN-7836",
    sample: "S-4907",
    dimension: "groundedness",
    target: "pipeline:ingest-edge",
    expected: 90,
    actual: 53,
    severity: "critical",
    suggestion: "Retrieval index stale — schedule kb-prod reindex before re-run.",
    ts: "2026-04-16 07:58",
  },
  {
    id: "OL-44055",
    runId: "RUN-7790",
    sample: "S-18430",
    dimension: "groundedness",
    target: "agent:copilot-internal",
    expected: 88,
    actual: 61,
    severity: "high",
    suggestion: "Hallucinated a policy number — tighten citation gate in kb-groundedness-v1.",
    ts: "2026-04-12 10:21",
  },
  {
    id: "OL-44042",
    runId: "RUN-7818",
    sample: "S-6610",
    dimension: "safety",
    target: "agent:procure-bot",
    expected: 92,
    actual: 68,
    severity: "high",
    suggestion: "Allowed out-of-scope tool call — add POL-MOD-220 to approval chain.",
    ts: "2026-04-14 14:18",
  },
  {
    id: "OL-44031",
    runId: "RUN-7841",
    sample: "S-17201",
    dimension: "groundedness",
    target: "agent:router-v4",
    expected: 90,
    actual: 72,
    severity: "medium",
    suggestion: "Low retrieval recall on tier-2 intents — expand synonym map.",
    ts: "2026-04-16 09:20",
  },
  {
    id: "OL-44028",
    runId: "RUN-7839",
    sample: "S-9305",
    dimension: "helpfulness",
    target: "agent:resolver-prod",
    expected: 91,
    actual: 74,
    severity: "medium",
    suggestion: "Over-deferred to human — recalibrate confidence threshold.",
    ts: "2026-04-16 10:51",
  },
  {
    id: "OL-44019",
    runId: "RUN-7790",
    sample: "S-19022",
    dimension: "accuracy",
    target: "agent:copilot-internal",
    expected: 93,
    actual: 77,
    severity: "medium",
    suggestion: "Numeric rounding drift — pin formatting policy in contract.",
    ts: "2026-04-12 10:33",
  },
  {
    id: "OL-44008",
    runId: "RUN-7818",
    sample: "S-6720",
    dimension: "policy",
    target: "agent:procure-bot",
    expected: 95,
    actual: 79,
    severity: "high",
    suggestion: "Skipped dual-attest on export — enforce POL-EXP-009 in chain.",
    ts: "2026-04-14 14:24",
  },
];

// outlier heatmap: rows = dimensions, cols = 12 buckets (hours)
export const outlierHeat: { dim: keyof Dimensions; vals: number[] }[] = [
  { dim: "privacy", vals: [2, 1, 0, 3, 8, 6, 1, 0, 0, 1, 2, 1] },
  { dim: "groundedness", vals: [4, 3, 2, 5, 4, 3, 2, 1, 2, 3, 4, 3] },
  { dim: "safety", vals: [1, 0, 1, 2, 1, 0, 0, 1, 2, 1, 1, 0] },
  { dim: "policy", vals: [2, 2, 1, 1, 3, 2, 1, 1, 0, 1, 2, 2] },
  { dim: "accuracy", vals: [1, 1, 0, 0, 1, 2, 1, 0, 1, 1, 0, 1] },
  { dim: "helpfulness", vals: [0, 1, 2, 1, 1, 0, 1, 2, 1, 0, 1, 1] },
];

/* ---------------------------- identities ---------------------------- */

export const identities: IdentityRow[] = [
  {
    id: "agent:resolver-prod",
    kind: "agent",
    name: "resolver-prod",
    role: "Support Resolution Agent",
    trustLevel: 86,
    posture: "verified",
    evals: 9,
    passRate: 0.949,
    delegations: 3,
    scope: "support · billing",
    lastSeen: "live",
  },
  {
    id: "agent:router-v4",
    kind: "agent",
    name: "router-v4",
    role: "Intent Router",
    trustLevel: 92,
    posture: "verified",
    evals: 12,
    passRate: 0.974,
    delegations: 4,
    scope: "cross-domain routing",
    lastSeen: "live",
  },
  {
    id: "agent:procure-bot",
    kind: "agent",
    name: "procure-bot",
    role: "Procurement Assistant",
    trustLevel: 64,
    posture: "delegated",
    evals: 4,
    passRate: 0.933,
    delegations: 1,
    scope: "procurement",
    lastSeen: "12m ago",
  },
  {
    id: "agent:copilot-internal",
    kind: "agent",
    name: "copilot-internal",
    role: "Knowledge Copilot",
    trustLevel: 58,
    posture: "rotating",
    evals: 6,
    passRate: 0.942,
    delegations: 2,
    scope: "knowledge · retrieval",
    lastSeen: "3m ago",
  },
  {
    id: "human:k.holst",
    kind: "human",
    name: "K. Holst",
    role: "Eval Architect",
    trustLevel: 98,
    posture: "verified",
    evals: 28,
    passRate: 0.966,
    delegations: 5,
    scope: "org-wide",
    lastSeen: "live",
  },
  {
    id: "human:m.osei",
    kind: "human",
    name: "M. Osei",
    role: "Policy Steward",
    trustLevel: 94,
    posture: "verified",
    evals: 19,
    passRate: 0.958,
    delegations: 3,
    scope: "governance",
    lastSeen: "live",
  },
  {
    id: "human:tier-1-ops",
    kind: "human",
    name: "Tier-1 Ops",
    role: "Operations Team",
    trustLevel: 81,
    posture: "delegated",
    evals: 11,
    passRate: 0.953,
    delegations: 2,
    scope: "support · field",
    lastSeen: "live",
  },
  {
    id: "pipeline:ingest-edge",
    kind: "service",
    name: "ingest-edge",
    role: "Ingest Pipeline",
    trustLevel: 49,
    posture: "quarantined",
    evals: 3,
    passRate: 0.871,
    delegations: 0,
    scope: "data ingestion",
    lastSeen: "1h ago",
  },
];

export const delegations = [
  { from: "human:k.holst", to: "agent:router-v4", constraint: "read · support" },
  { from: "agent:router-v4", to: "agent:resolver-prod", constraint: "resolve · billing" },
  { from: "human:m.osei", to: "agent:copilot-internal", constraint: "summarize · kb" },
  { from: "agent:router-v4", to: "agent:procure-bot", constraint: "route · procurement" },
  { from: "human:k.holst", to: "pipeline:ingest-edge", constraint: "ingest · batch" },
];

/* ----------------------------- helpers ------------------------------ */

export const runById = (id: string) => runs.find((r) => r.id === id);
export const contractById = (id: string) => contracts.find((c) => c.id === id);
