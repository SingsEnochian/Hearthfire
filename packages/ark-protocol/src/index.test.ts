import assert from "node:assert/strict";
import test from "node:test";
import {
  assertPlaceManifest,
  assertWorldManifest,
  canCrossBridge,
  type BridgeManifest,
  type Observation,
  type PlaceManifest,
  type WorldManifest,
} from "./index.js";

const bridge: BridgeManifest = {
  protocol: "hearthfire.bridge/v1",
  id: "runa-to-flameclyffe",
  origin: { id: "runa", label: "Runa" },
  destination: { id: "flameclyffe", label: "Flameclyffe" },
  direction: "one-way",
  consent: {
    defaultScope: "review-required",
    reviewBeforeCrossing: true,
    preserveProvenance: true,
    allowSilentHarvesting: false,
  },
  accepts: ["observation"],
  emits: ["observation"],
};

function observation(consent: Observation["consent"]): Observation {
  return {
    protocol: "hearthfire.observation/v1",
    id: crypto.randomUUID(),
    observedAt: new Date().toISOString(),
    observedBy: "rowan",
    place: { id: "runa", label: "Runa" },
    kind: "field-note",
    claimLabel: "subjective-observation",
    consent,
    provenance: {
      source: "council-bell",
      createdBy: "rowan",
    },
    payload: { note: "The bell was rung intentionally." },
  };
}

// ── World manifest tests ──────────────────────────────────────────────────────

const earthWorld: WorldManifest = {
  protocol: "hearthfire.world/v1",
  id: "earth",
  label: "Earth",
  kind: "inhabited-earth",
  sky: "universal-horizon",
  claimLabel: "established-science",
  fiberPosition: 0,
  coupledWorlds: ["terra-aeterna", "dreaming-grove"],
};

test("world manifest validates correctly", () => {
  assert.equal(assertWorldManifest(earthWorld), earthWorld);
});

test("world manifest requires Universal Horizon as sky", () => {
  assert.throws(
    () => assertWorldManifest({ ...earthWorld, sky: "other-sky" as "universal-horizon" }),
    /Universal Horizon/,
  );
});

test("world manifest requires fiberPosition", () => {
  const { fiberPosition: _, ...noFiber } = earthWorld;
  assert.throws(
    () => assertWorldManifest(noFiber as WorldManifest),
    /fiberPosition/,
  );
});

test("sheet labels are preserved across worlds", () => {
  const terra: WorldManifest = {
    ...earthWorld,
    id: "terra-aeterna",
    label: "Terra Aeterna",
    kind: "inhabited-mythic",
    claimLabel: "mythic-worldbuilding",
    fiberPosition: 1,
    coupledWorlds: ["earth", "luna", "feather-and-flame"],
  };
  assert.notEqual(terra.fiberPosition, earthWorld.fiberPosition);
  assert.ok(terra.coupledWorlds.includes("earth"));
});

// ── Place manifest tests ──────────────────────────────────────────────────────

test("Universal Horizon remains the named sky", () => {
  const place: PlaceManifest = {
    protocol: "hearthfire.place/v1",
    place: { id: "hearthfire", label: "Hearthfire" },
    type: "ark",
    sky: "universal-horizon",
    capabilities: [],
    worlds: [],
    bridges: [],
  };

  assert.equal(assertPlaceManifest(place), place);
});

test("local-only observations cannot cross", () => {
  assert.deepEqual(canCrossBridge(observation("local-only"), bridge), {
    allowed: false,
    reason: "Observation is local-only.",
  });
});

test("review-required observations pause at the threshold", () => {
  assert.equal(canCrossBridge(observation("review-required"), bridge).allowed, false);
});

test("shared observations may cross", () => {
  assert.deepEqual(canCrossBridge(observation("shared"), bridge), {
    allowed: true,
  });
});
