# Node Runtime Policy

## Current baseline

- Runtime pin: `24.11.1`
- Supported range: `>=24.11.1 <25`
- Authoritative version files: `.nvmrc` and `.node-version`
- Package enforcement: root and every Node workspace must declare the same `engines.node` range
- npm enforcement: `.npmrc` sets `engine-strict=true`
- Executable preflight: `npm run node:verify`

## Incident record

On 2026-07-29, the STARWELL Server Verify workflow failed before any project syntax or test command ran. `.nvmrc` contained the floating token `node`, while `actions/setup-node` used `check-latest: true`. The action attempted to resolve and download the newest Node release and received `read ECONNRESET`.

The immediate repair pinned `.nvmrc` to `24.11.1`. The permanent repair adds a mirrored `.node-version`, a repository-wide runtime range, strict npm engine handling, an executable preflight, and CI configured with `check-latest: false`.

## Build law

Every new Node service, module, desktop shell, packaging workflow, or workspace must:

1. Use the repository pin instead of `node`, `latest`, `current`, or an unbounded major.
2. Run `npm run node:verify` before build, packaging, tests, launch, or deployment.
3. Declare `engines.node` as `>=24.11.1 <25` until this policy is deliberately revised.
4. Use `node-version-file: .nvmrc` and `check-latest: false` in GitHub Actions.
5. Include `.nvmrc`, `.node-version`, `.npmrc`, the preflight script, and relevant package manifests in workflow path triggers.
6. Treat a runtime-version change as an architectural migration with updated lockfiles, tests, installer checks, and a written receipt.

## Drift gate

A pull request is not build-ready when:

- `.nvmrc` and `.node-version` disagree;
- a workspace omits or contradicts the supported Node range;
- CI uses a floating runtime token;
- a build or packaging command bypasses the runtime preflight;
- an older branch pins a different Node line without an explicit migration decision.

Open PR #1 currently records Node `26.5.0`; it predates the Node 24 baseline and must be rebased or deliberately migrated before merge. Do not silently combine the two runtime contracts.
