import { buildArcsweepOsCapabilities } from './project-zero-arcsweep-os.mjs';

export function buildProjectZeroCapabilities() {
  return {
    schema: 'hearthfire.project-zero-capabilities/v1',
    provider: {
      id: 'hearthfire.starwell',
      role: 'runtime-and-operational-substrate',
    },
    compatibility: {
      target: 'Project Zero orchestration station',
      mode: 'read-contract-first',
      ownership: 'subsystem owners remain authoritative',
    },
    capabilities: [
      {
        id: 'diagnostics.read',
        version: 'v1',
        transport: 'http-json',
        route: '/api/project-zero/diagnostics',
        mutates: false,
      },
      {
        id: 'capabilities.read',
        version: 'v1',
        transport: 'http-json',
        route: '/api/project-zero/capabilities',
        mutates: false,
      },
      {
        id: 'operational-events',
        version: 'v1',
        transport: 'contract',
        schema: 'hearthfire.operational-event/v1',
        mutates: false,
      },
      {
        id: 'proving-receipts',
        version: 'v1',
        transport: 'contract',
        schema: 'hearthfire.proving-receipt/v1',
        mutates: false,
      },
      {
        id: 'release-evidence',
        version: 'v1',
        transport: 'contract',
        schema: 'hearthfire.release-evidence/v1',
        mutates: false,
      },
      {
        id: 'continuity-replay-verification',
        version: 'v1',
        transport: 'diagnostic',
        mutates: false,
      },
      {
        id: 'arcsweep-os.capabilities',
        version: 'v1',
        transport: 'http-json',
        route: '/api/project-zero/arcsweep-os/capabilities',
        mutates: false,
      },
      {
        id: 'arcsweep-os.health',
        version: 'v1',
        transport: 'http-json',
        route: '/api/project-zero/arcsweep-os/health',
        mutates: false,
      },
    ],
    writes: [
      {
        id: 'arcsweep-os.state',
        version: 'v1',
        transport: 'http-json',
        route: '/api/project-zero/arcsweep-os/state',
        methods: ['GET', 'POST'],
        mutates: true,
        note: 'GET reads last OS state snapshot; POST accepts bounded OS context capsule/session state from the Arcsweep OS kernel.',
      },
    ],
    arcsweep_os: buildArcsweepOsCapabilities(),
    lanternbridge: {
      relationship: 'compatible-peer-boundary',
      note: 'Hearthfire does not claim Lanternbridge ownership; adapters may map matching semantics while preserving protocol authority.',
    },
    generatedAt: new Date().toISOString(),
  };
}
