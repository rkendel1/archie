# archie

Local-first engineering participant MVP.

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
- `participant watch`
- `participant serve`
- `participant status --live`
- `participant session start --intent "..."`
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
