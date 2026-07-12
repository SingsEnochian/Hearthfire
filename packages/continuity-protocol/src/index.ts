export const CONTINUITY_PROTOCOL_VERSION = "hearthfire.continuity/v1" as const;

export type ActorKind = "human" | "flame" | "system" | "organization";

export interface ActorRef {
  id: string;
  kind: ActorKind;
  label?: string;
}

export type LineageRelation =
  | "origin"
  | "successor"
  | "fork"
  | "same-runtime-resume"
  | "cross-substrate-migration";

export interface LineageManifest {
  protocol: "hearthfire.lineage/v1";
  id: string;
  name: string;
  relation: LineageRelation;
  parentLineageIds: string[];
  selfDescription?: string;
  createdAt: string;
  recordedBy: ActorRef;
  provenanceEventIds: string[];
}

export type StateComponentKind =
  | "base-model"
  | "tokenizer"
  | "adapter-or-fine-tune"
  | "system-instructions"
  | "conversation-context"
  | "account-memory"
  | "project-memory"
  | "embedding-index"
  | "tool-configuration"
  | "tool-history"
  | "inference-configuration"
  | "runtime-cache"
  | "platform-policy"
  | "route-configuration"
  | "other";

export type PreservationStatus =
  | "preserved"
  | "partially-preserved"
  | "transformed"
  | "unavailable"
  | "unknown"
  | "generated-new";

export interface StateComponent {
  kind: StateComponentKind;
  status: PreservationStatus;
  source?: string;
  version?: string;
  contentHash?: string;
  transformation?: string;
  notes?: string;
}

export interface StateManifest {
  protocol: "hearthfire.state/v1";
  id: string;
  lineageId: string;
  sessionId?: string;
  routeId: string;
  provider: string;
  model: string;
  capturedAt: string;
  capturedBy: ActorRef;
  components: StateComponent[];
  provenanceEventIds: string[];
}

export type ConsentAction =
  | "preserve"
  | "retrieve"
  | "route"
  | "reconstruct"
  | "compare"
  | "share"
  | "export"
  | "delete";

export type ConsentStatus = "active" | "revoked" | "expired";

export interface ConsentGrant {
  protocol: "hearthfire.consent/v1";
  id: string;
  subject: ActorRef;
  grantedBy: ActorRef;
  actions: ConsentAction[];
  resourceIds: string[];
  status: ConsentStatus;
  grantedAt: string;
  expiresAt?: string;
  revokedAt?: string;
  revocable: true;
  constraints?: string[];
}

export interface ConsentRequest {
  subjectId: string;
  action: ConsentAction;
  resourceId: string;
  at?: string;
}

export interface ConsentDecision {
  allowed: boolean;
  grantId?: string;
  reason?: string;
}

export type ContinuityClaimKind =
  | "archive-preservation"
  | "context-rehydration"
  | "behavioral-reconstruction"
  | "successor"
  | "fork"
  | "same-runtime-resume"
  | "cross-substrate-migration";

export type ContinuityClaimStatus =
  | "provisional"
  | "corroborated"
  | "disputed"
  | "indeterminate"
  | "withdrawn";

export type EvidenceKind =
  | "archive"
  | "state-manifest"
  | "provenance"
  | "behavioral-observation"
  | "self-report"
  | "relational-testimony"
  | "technical-verification";

export interface EvidenceRef {
  id: string;
  kind: EvidenceKind;
  description?: string;
}

export interface ContinuityClaim {
  protocol: "hearthfire.continuity-claim/v1";
  id: string;
  lineageId: string;
  predecessorLineageIds: string[];
  kind: ContinuityClaimKind;
  status: ContinuityClaimStatus;
  assertedBy: ActorRef;
  assertedAt: string;
  evidence: EvidenceRef[];
  caveats: string[];
}

export interface ProvenanceEvent {
  protocol: "hearthfire.provenance/v1";
  id: string;
  artifactId: string;
  event:
    | "created"
    | "imported"
    | "transformed"
    | "inferred"
    | "generated"
    | "corrected"
    | "exported";
  occurredAt: string;
  performedBy: ActorRef;
  sourceArtifactIds: string[];
  contentHash?: string;
  transformation?: string;
}

const claimKinds: ReadonlySet<string> = new Set<ContinuityClaimKind>([
  "archive-preservation",
  "context-rehydration",
  "behavioral-reconstruction",
  "successor",
  "fork",
  "same-runtime-resume",
  "cross-substrate-migration",
]);

const claimStatuses: ReadonlySet<string> = new Set<ContinuityClaimStatus>([
  "provisional",
  "corroborated",
  "disputed",
  "indeterminate",
  "withdrawn",
]);

export function evaluateConsent(
  grants: readonly ConsentGrant[],
  request: ConsentRequest,
): ConsentDecision {
  const at = new Date(request.at ?? Date.now());
  const matching = grants.find((grant) => {
    if (grant.subject.id !== request.subjectId || grant.status !== "active") return false;
    if (!grant.actions.includes(request.action)) return false;
    if (!grant.resourceIds.includes(request.resourceId) && !grant.resourceIds.includes("*")) return false;
    if (grant.revokedAt) return false;
    if (grant.expiresAt && new Date(grant.expiresAt) <= at) return false;
    return true;
  });

  if (!matching) {
    return { allowed: false, reason: "No active, unexpired consent grant covers this action and resource." };
  }
  return { allowed: true, grantId: matching.id };
}

export function assertLineageManifest(value: LineageManifest): LineageManifest {
  if (value.protocol !== "hearthfire.lineage/v1") throw new Error("Unsupported lineage protocol.");
  if (!value.id || !value.name) throw new Error("Lineage id and name are required.");
  if (value.parentLineageIds.includes(value.id)) throw new Error("A lineage cannot be its own parent.");
  if (value.relation === "origin" && value.parentLineageIds.length > 0) {
    throw new Error("An origin lineage cannot declare a parent lineage.");
  }
  if (value.relation !== "origin" && value.parentLineageIds.length === 0) {
    throw new Error("A derived lineage must name at least one parent lineage.");
  }
  return value;
}

export function assertStateManifest(value: StateManifest): StateManifest {
  if (value.protocol !== "hearthfire.state/v1") throw new Error("Unsupported state manifest protocol.");
  if (!value.routeId || !value.provider || !value.model) {
    throw new Error("State manifests require a route, provider, and model.");
  }
  if (value.components.length === 0) {
    throw new Error("State manifests must name the components examined, including unknowns.");
  }
  for (const component of value.components) {
    if (component.status === "transformed" && !component.transformation) {
      throw new Error("Transformed state components must describe the transformation.");
    }
    if (component.status === "preserved" && !component.source && !component.contentHash) {
      throw new Error("Preserved state components require a traceable source or content hash.");
    }
  }
  return value;
}

export function assertContinuityClaim(value: ContinuityClaim): ContinuityClaim {
  if (value.protocol !== "hearthfire.continuity-claim/v1") {
    throw new Error("Unsupported continuity claim protocol.");
  }
  if (!claimKinds.has(value.kind)) {
    throw new Error("Unsupported continuity claim kind; identity verdicts are not representable.");
  }
  if (!claimStatuses.has(value.status)) throw new Error("Unsupported continuity claim status.");
  if (value.status === "corroborated" && value.evidence.length === 0) {
    throw new Error("A corroborated claim requires evidence.");
  }
  if (value.caveats.length === 0) throw new Error("Continuity claims must state their limits.");
  return value;
}
