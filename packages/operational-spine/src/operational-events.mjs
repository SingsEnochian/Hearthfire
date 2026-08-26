const LEVELS = new Set(['debug', 'info', 'warn', 'error']);

export function createOperationalEvent(input) {
  const event = {
    schema: 'hearthfire.operational-event/v1',
    id: input.id ?? crypto.randomUUID(),
    timestamp: input.timestamp ?? new Date().toISOString(),
    level: input.level ?? 'info',
    subsystem: String(input.subsystem ?? '').trim(),
    event: String(input.event ?? '').trim(),
    message: String(input.message ?? '').trim(),
    owner: input.owner ?? null,
    correlationId: input.correlationId ?? null,
    provenance: input.provenance ?? null,
    context: input.context ?? {},
    error: normalizeError(input.error),
  };

  const issues = validateOperationalEvent(event);
  if (issues.length) throw new TypeError(`Invalid operational event: ${issues.join('; ')}`);
  return Object.freeze(event);
}

export function validateOperationalEvent(event) {
  const issues = [];
  if (!event || typeof event !== 'object') return ['event must be an object'];
  if (event.schema !== 'hearthfire.operational-event/v1') issues.push('schema mismatch');
  if (!LEVELS.has(event.level)) issues.push('level invalid');
  if (!event.id) issues.push('id required');
  if (!event.timestamp || Number.isNaN(Date.parse(event.timestamp))) issues.push('timestamp invalid');
  if (!event.subsystem) issues.push('subsystem required');
  if (!event.event) issues.push('event required');
  if (!event.message) issues.push('message required');
  if (!event.context || typeof event.context !== 'object' || Array.isArray(event.context)) issues.push('context must be an object');
  return issues;
}

export function normalizeError(error) {
  if (!error) return null;
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack ?? null };
  }
  return { name: 'NonError', message: String(error), stack: null };
}

export class OperationalEventBuffer {
  #events = [];
  constructor(limit = 500) { this.limit = limit; }
  emit(input) {
    const event = createOperationalEvent(input);
    this.#events.push(event);
    if (this.#events.length > this.limit) this.#events.splice(0, this.#events.length - this.limit);
    return event;
  }
  latest(subsystem) {
    const events = subsystem ? this.#events.filter((event) => event.subsystem === subsystem) : this.#events;
    return events.at(-1) ?? null;
  }
  list() { return [...this.#events]; }
}
