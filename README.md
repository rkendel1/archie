# archie

Local-first engineering participant MVP.

## Buzz-backed change rooms

Archie change sessions now run inside persistent Buzz-style change rooms where participants collaborate as equal parties.

- Buzz dependency is pinned at commit `ac4fa13b8e4d947071d57deb6918dcf12bf74961` via `vendor/buzz`
- Active room: `GET /v1/changes/active/room`
- Participants: `GET|POST /v1/changes/active/participants`
- Advisory contributions: `GET|POST /v1/changes/active/contributions`

## PR8 control plane APIs

The runtime now exposes control-plane endpoints for system truth, coordination, and assurance:

- `GET /v1/control-plane`
- `GET /v1/control-plane/review-queue`
- `GET|POST /v1/control-plane/work-claims`
- `POST /v1/control-plane/decisions`

## Product promise

Connect your repository and get a living model of how the system works. As AI and developers change the code, the model updates, explains impact, detects architectural drift, identifies missing evidence, and enforces contracts locally and in CI.

## Installable npm package

```bash
npm install
npm link
```

Commands:

- `participant init`
- `participant analyze --summary`
- `participant analyze --summary --language python`
- `participant analyzers`
- `participant watch`
- `participant serve`
- `participant status --live`
- `participant session start --intent "..."`
- `participant change propose --intent "Add anomaly detection" --files src/analytics.ts,workers/anomaly-worker.rs`
- `participant change review`
- `participant change guidance`
- `participant context --change <change_session_id_or_proposal_id> --format summary`
- `participant agent discover`
- `participant agent register --id coding-agent-01 --name "Local Coding Agent" --capabilities read,write,plan,verify`
- `participant agent context --session <agent_session_id> --intent "..." --detail focused --format markdown`
- `participant agent plan submit --session <agent_session_id> --file plan.json`
- `participant agent files declare --session <agent_session_id> --files src/a.ts,src/b.ts`
- `participant agent implementation report --session <agent_session_id> --file implementation.json`
- `participant agent evidence submit --session <agent_session_id> --file evidence.json`
- `participant agent verify --session <agent_session_id>`
- `participant agent complete --session <agent_session_id>`
- `participant check architecture|contracts|capabilities`
- `participant impact`
- `participant verify --changed`
- `participant report --format github`
- `participant confirm`
- `participant correct "<architecture correction>"`

## Desktop MVP

Run:

```bash
participant-desktop
```

Open `http://localhost:43111`.

Desktop features in this MVP:

- Open local repository
- Detect project structure
- Build live system graph summary
- Identify important files
- Show architecture/runtime boundaries
- Show polyglot language and analyzer summary (JS/TS + Python)
- Watch file changes
- Show change impact
- Confirm or correct inferred architecture
- Generate GitHub Actions assurance workflow

## CI assurance workflow

`participant init` generates:

`.github/workflows/engineering-assurance.yml`

The workflow runs architecture checks, contract checks, changed-capability checks, evidence requirements, and a pull-request style assurance report.

## Tests

```bash
npm test
```
