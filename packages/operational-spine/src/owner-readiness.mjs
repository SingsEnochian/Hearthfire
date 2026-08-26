export class OwnerReadinessRegistry {
  #owners = new Map();
  constructor({ events } = {}) { this.events = events ?? null; }

  register({ owner, subsystem = owner, validate, dependencies = [] }) {
    if (!owner || typeof validate !== 'function') throw new TypeError('owner and validate function are required');
    this.#owners.set(owner, { owner, subsystem, validate, dependencies: [...dependencies], ready: false, state: null, lastFailure: null, validatedAt: null });
  }

  setState(owner, state) {
    const record = this.#require(owner);
    record.state = state;
    return this.validate(owner);
  }

  validate(owner) {
    const record = this.#require(owner);
    const blocked = record.dependencies.filter((dependency) => !this.#owners.get(dependency)?.ready);
    let issues = [];
    if (blocked.length) issues.push(`dependencies not ready: ${blocked.join(', ')}`);
    try {
      const contractIssues = record.validate(record.state) ?? [];
      if (Array.isArray(contractIssues)) issues.push(...contractIssues);
      else if (contractIssues !== true) issues.push('validator returned invalid result');
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
    }

    record.validatedAt = new Date().toISOString();
    record.ready = issues.length === 0;
    record.lastFailure = record.ready ? null : { at: record.validatedAt, issues };
    this.events?.emit({
      level: record.ready ? 'info' : 'error', subsystem: record.subsystem,
      event: record.ready ? 'OWNER_READY' : 'OWNER_NOT_READY',
      message: record.ready ? `${owner} owner ready` : `${owner} owner contract rejected`,
      owner, context: { issues, dependencies: record.dependencies },
    });
    return this.status(owner);
  }

  read(owner) {
    const record = this.#require(owner);
    if (!record.ready) throw new Error(`Owner ${owner} is not ready`);
    const status = this.validate(owner);
    if (!status.ready) throw new Error(`Owner ${owner} failed contract validation on read`);
    return record.state;
  }

  status(owner) {
    const r = this.#require(owner);
    return { owner: r.owner, subsystem: r.subsystem, ready: r.ready, dependencies: [...r.dependencies], validatedAt: r.validatedAt, lastFailure: r.lastFailure };
  }

  snapshot() { return [...this.#owners.keys()].map((owner) => this.status(owner)); }
  #require(owner) { const record = this.#owners.get(owner); if (!record) throw new Error(`Unknown owner: ${owner}`); return record; }
}
