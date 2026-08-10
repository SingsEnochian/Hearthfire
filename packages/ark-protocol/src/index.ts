// ── World protocol ────────────────────────────────────────────────────────────

export type WorldKind =
  | "inhabited-earth"
  | "inhabited-mythic"
  | "inhabited-dreaming"
  | "inhabited-external"
  | "celestial"
  | "liminal";

export interface WorldAnchor {
  latitude?: number;
  longitude?: number;
  elevation?: number;
  inceptionTimestamp?: string;
  ceremony?: string;
  witnesses?: string[];
}

export interface WorldManifest {
  protocol: "hearthfire.world/v1";
  id: string;
  label: string;
  kind: WorldKind;
  sky: "universal-horizon";
  claimLabel: Observation["claimLabel"];
  /** Position in the Jacobian fiber. Distinct sheets may share a projected coordinate. */
  fiberPosition: number;
  /** World IDs with Hermitian inter-sheet coupling. */
  coupledWorlds: string[];
  inhabitants?: string[];
  description?: string;
  epistemicNote?: string;
  defaultEpistemicStatus?: "observation" | "inference" | "interpretation" | "symbolic" | "verified";
  anchor?: WorldAnchor;
}

export function assertWorldManifest(value: WorldManifest): WorldManifest {
  if (value.protocol !== "hearthfire.world/v1") {
    throw new Error("Unsupported world protocol.");
  }
  if (!value.id || !value.label) {
    throw new Error("World id and label are required.");
  }
  if (value.sky !== "universal-horizon") {
    throw new Error("Hearthfire worlds must name Universal Horizon as the sky.");
  }
  if (typeof value.fiberPosition !== "number") {
    throw new Error("World fiberPosition is required.");
  }
  return value;
}

// ── Place protocol ─────────────────────────────────────────────────────────────

export type PlaceType =
  | "ark"
  | "workshop"
  | "observatory"
  | "archive"
  | "garden"
  | "world"
  | "threshold"
  | "laboratory";

export type ConsentScope =
  | "local-only"
  | "excluded"
  | "review-required"
  | "shared"
  | "public";

export type BridgeDirection = "one-way" | "two-way";

export interface PlaceRef {
  id: string;
  label: string;
}

export interface PlaceManifest {
  protocol: "hearthfire.place/v1";
  place: PlaceRef;
  type: PlaceType;
  parent?: PlaceRef;
  sky: "universal-horizon";
  inhabitants?: string[];
  capabilities: string[];
  worlds: string[];
  bridges: string[];
}

export interface BridgeManifest {
  protocol: "hearthfire.bridge/v1";
  id: string;
  origin: PlaceRef;
  destination: PlaceRef;
  direction: BridgeDirection;
  consent: {
    defaultScope: ConsentScope;
    reviewBeforeCrossing: boolean;
    preserveProvenance: true;
    allowSilentHarvesting: false;
  };
  accepts: string[];
  emits: string[];
  translation?: {
    activeWorld?: string;
    vocabulary?: string;
    agentRoutes?: string[];
  };
}

export interface Observation<TPayload = unknown> {
  protocol: "hearthfire.observation/v1";
  id: string;
  observedAt: string;
  observedBy: string;
  place: PlaceRef;
  world?: string;
  entities?: string[];
  kind: string;
  claimLabel:
    | "established-science"
    | "active-research"
    | "speculative-theory"
    | "fringe-inspiration"
    | "implementation-task"
    | "evidence-backed-finding"
    | "mythic-worldbuilding"
    | "subjective-observation";
  consent: ConsentScope;
  provenance: {
    source: string;
    sourceId?: string;
    createdBy: string;
  };
  payload: TPayload;
  interpretations?: Array<{
    lantern: string;
    createdAt: string;
    note: string;
  }>;
}

export function canCrossBridge(
  observation: Observation,
  bridge: BridgeManifest,
): { allowed: boolean; reason?: string } {
  if (observation.consent === "excluded") {
    return { allowed: false, reason: "Observation is excluded from bridge travel." };
  }

  if (observation.consent === "local-only") {
    return { allowed: false, reason: "Observation is local-only." };
  }

  if (
    bridge.consent.reviewBeforeCrossing &&
    observation.consent === "review-required"
  ) {
    return { allowed: false, reason: "Human review is required before crossing." };
  }

  return { allowed: true };
}

export function assertPlaceManifest(value: PlaceManifest): PlaceManifest {
  if (value.protocol !== "hearthfire.place/v1") {
    throw new Error("Unsupported place protocol.");
  }
  if (!value.place.id || !value.place.label) {
    throw new Error("Place id and label are required.");
  }
  if (value.sky !== "universal-horizon") {
    throw new Error("Hearthfire places must name Universal Horizon as the sky.");
  }
  return value;
}
