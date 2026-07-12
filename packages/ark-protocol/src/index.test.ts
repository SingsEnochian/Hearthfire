import assert from "node:assert/strict";
import test from "node:test";
import {
  assertPlaceManifest,
  canCrossBridge,
  type BridgeManifest,
  type Observation,
  type PlaceManifest,
} from "./index.ts";

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
