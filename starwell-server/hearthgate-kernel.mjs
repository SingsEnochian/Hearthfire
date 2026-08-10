// hearthgate-kernel.mjs
// Proxy and blend layer: calls the Python hearthgate-kernel and merges text-loom PREMAQ
// (felt shore) with live environmental PREMAQ (measured shore) from observer-environment.
//
// Measured shore — environmental signals (solar wind, Kp, seismic, etc.)
//   Source: observer-environment.mjs / fetchEnvironmentReading()
//   Epistemic claim: established-science inputs, speculative-theory weights
//
// Felt shore — text typed by the user, processed through the Loom
//   Source: hearthgate-kernel Python server (port 8000 by default)
//   Epistemic claim: field_model (loom-layer PREMAQ proxies)
//
// Blended PREMAQ — dual-aspect field state.
// Environmental shore carries 60% weight; kernel/loom shore carries 40%.
// If the kernel is unreachable, the call fails cleanly (do not fall back silently).
// If the environment is unreachable, kernel-only PREMAQ is returned (non-fatal).

import { fetchEnvironmentReading } from './observer-environment.mjs';

const KERNEL_BASE = process.env.HEARTHGATE_KERNEL_URL ?? 'http://127.0.0.1:8000';
const KERNEL_TIMEOUT_MS = 10_000;

function clamp01(v) {
  return Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
}

function round4(v) {
  return Math.round(v * 10000) / 10000;
}

// Field name mapping: observer-environment uses lowercase words;
// kernel uses single-letter PREMAQ keys.
// Q (charge/quality) has no direct environmental equivalent.
function _blendPremaq(envPremaq, kernelPremaq) {
  const e = envPremaq ?? {};
  const hasEnv = envPremaq !== null;
  const we = hasEnv ? 0.6 : 0.0;
  const wk = hasEnv ? 0.4 : 1.0;

  return {
    P: round4(clamp01((e.pulse      ?? 0) * we + kernelPremaq.P * wk)),
    C: round4(clamp01((e.coherence  ?? 0) * we + kernelPremaq.C * wk)),
    R: round4(clamp01((e.resonance  ?? 0) * we + kernelPremaq.R * wk)),
    E: round4(clamp01((e.entropy    ?? 0) * we + kernelPremaq.E * wk)),
    M: round4(clamp01((e.memory     ?? 0) * we + kernelPremaq.M * wk)),
    A: round4(clamp01((e.axis       ?? 0) * we + kernelPremaq.A * wk)),
    Q: round4(clamp01(kernelPremaq.Q)),
  };
}

export async function kernelCrossing({ textInput, epistemicModes, originHouse = 'House_Nocturne', sanctumAnchor = null }) {
  // ── 1. Call Python kernel ────────────────────────────────────────────────
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), KERNEL_TIMEOUT_MS);

  let kernelData;
  try {
    const res = await fetch(`${KERNEL_BASE}/api/v1/hearthgate/crossing`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text_input: textInput,
        epistemic_modes: epistemicModes,
        origin_house: originHouse,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`kernel-http-${res.status}: ${body.slice(0, 120)}`);
    }
    kernelData = await res.json();
  } catch (err) {
    clearTimeout(timer);
    const message = err.name === 'AbortError'
      ? `Hearthgate kernel timed out after ${KERNEL_TIMEOUT_MS}ms`
      : `Hearthgate kernel unreachable: ${err.message}`;
    throw new Error(message);
  }

  if (!kernelData.premaq) {
    throw new Error('Hearthgate kernel response missing premaq field — kernel may need updating.');
  }

  // ── 2. Fetch environmental PREMAQ (cached internally by observer-environment) ──
  let envPremaq = null;
  try {
    const envReading = await fetchEnvironmentReading(sanctumAnchor);
    envPremaq = envReading?.premaq ?? null;
  } catch {
    // Non-fatal: environmental PREMAQ is the measured shore but the felt shore
    // can carry the field alone if live signals are unavailable.
  }

  // ── 3. Blend: measured (env) + felt (kernel/loom) → dual-aspect field ────
  const blended = _blendPremaq(envPremaq, kernelData.premaq);

  return {
    ok: true,
    status:     kernelData.status,
    receipt_id: kernelData.receipt_id,
    radius:     kernelData.radius,
    stability:  kernelData.stability,
    shores: {
      measured: envPremaq
        ? { ...envPremaq, source: 'observer-environment', claimLabel: 'established-science + speculative-theory weights' }
        : null,
      felt: { ...kernelData.premaq, source: 'hearthgate-kernel-loom', claimLabel: 'field_model' },
    },
    premaq: blended,
  };
}
