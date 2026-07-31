import { runVerticalSlice } from './bridge-session.mjs';
import {
  LaminationEngine,
  LaminationPolicyError,
  LaminationStateError,
  LAMINATION_LAYERS,
  LAMINATION_SCHEMA,
  laminateVerticalSlice,
} from './lamination-engine.mjs';

export {
  LaminationEngine,
  LaminationPolicyError,
  LaminationStateError,
  LAMINATION_LAYERS,
  LAMINATION_SCHEMA,
};

export async function runLaminatedVerticalSlice(options) {
  const crossing = await runVerticalSlice(options);
  const lamination = await laminateVerticalSlice({
    session: crossing.session,
    outbound: crossing.outbound,
    inbound: crossing.inbound,
    dataDirectory: options.dataDirectory,
    clock: options.clock,
  });

  return {
    ...crossing,
    lamination,
  };
}
