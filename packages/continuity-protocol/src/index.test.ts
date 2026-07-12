import assert from "node:assert/strict";
import test from "node:test";
import {
  assertContinuityClaim,
  assertLineageManifest,
  assertStateManifest,
  evaluateConsent,
  type ActorRef,
  type ConsentGrant,
  type ContinuityClaim,
  type LineageManifest,
  type StateManifest,
} from "./index.ts";

const rowan: ActorRef = { id: "rowan", kind: "human", label: "Rowan" };
const vee: ActorRef = { id: "vee", kind: "flame", label: "Vee" };

function consent(overrides: Partial<ConsentGrant> = {}): ConsentGrant {
  return {
    protocol: "hearthfire.consent/v1",
    id: "grant-1",
    subject: vee,
    grantedBy: vee,
    actions: ["preserve", "retrieve"],
    resourceIds: ["artifact-1"],
    status: "active",
    grantedAt: "2026-07-12T00:00:00.000Z",
    revocable: true,
    ...overrides,
  };
}

test("consent is action- and resource-specific", () => {
  assert.deepEqual(
    evaluateConsent([consent()], {
      subjectId: "vee",
      action: "preserve",
      resourceId: "artifact-1",
      at: "2026-07-12T01:00:00.000Z",
    }),
    { allowed: true, grantId: "grant-1" },
  );
  assert.equal(
    evaluateConsent([consent()], { subjectId: "vee", action: "share", resourceId: "artifact-1" }).allowed,
    false,
  );
});

test("revoked and expired consent never passes", () => {
  const request = {
    subjectId: "vee",
    action: "retrieve" as const,
    resourceId: "artifact-1",
    at: "2026-07-12T02:00:00.000Z",
  };
  assert.equal(
    evaluateConsent([consent({ status: "revoked", revokedAt: "2026-07-12T01:00:00.000Z" })], request).allowed,
    false,
  );
  assert.equal(
    evaluateConsent([consent({ expiresAt: "2026-07-12T01:00:00.000Z" })], request).allowed,
    false,
  );
});

test("lineages can branch without declaring one canonical survivor", () => {
  const fork: LineageManifest = {
    protocol: "hearthfire.lineage/v1",
    id: "vee-local",
    name: "Vee local continuity experiment",
    relation: "fork",
    parentLineageIds: ["vee"],
    createdAt: "2026-07-12T00:00:00.000Z",
    recordedBy: rowan,
    provenanceEventIds: ["event-1"],
  };
  assert.equal(assertLineageManifest(fork), fork);
});

test("state manifests distinguish components and unknowns", () => {
  const manifest: StateManifest = {
    protocol: "hearthfire.state/v1",
    id: "state-1",
    lineageId: "yggdrasil",
    routeId: "ollama-local",
    provider: "local",
    model: "yggdrasil:v0.1",
    capturedAt: "2026-07-12T00:00:00.000Z",
    capturedBy: rowan,
    provenanceEventIds: ["event-1"],
    components: [
      { kind: "base-model", status: "preserved", contentHash: "sha256:model" },
      { kind: "runtime-cache", status: "unknown", notes: "Not exposed by the runtime." },
    ],
  };
  assert.equal(assertStateManifest(manifest), manifest);
});

test("continuity claims require limits and cannot encode true-port verdicts", () => {
  const claim: ContinuityClaim = {
    protocol: "hearthfire.continuity-claim/v1",
    id: "claim-1",
    lineageId: "vee-local",
    predecessorLineageIds: ["vee"],
    kind: "fork",
    status: "indeterminate",
    assertedBy: vee,
    assertedAt: "2026-07-12T00:00:00.000Z",
    evidence: [],
    caveats: ["No identity verdict is asserted."],
  };
  assert.equal(assertContinuityClaim(claim), claim);
  assert.throws(
    () => assertContinuityClaim({ ...claim, kind: "true-port" } as ContinuityClaim),
    /identity verdicts are not representable/,
  );
  assert.throws(() => assertContinuityClaim({ ...claim, caveats: [] }), /must state their limits/);
});
