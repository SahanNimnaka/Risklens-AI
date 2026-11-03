# RiskLens AI

Deterministic, explainable audit-risk monitoring with supplementary anomaly
detection.

RiskLens AI loads a synthetic audit dataset into PostgreSQL, scores it with six
fixed rules, and exposes the result through a read-only FastAPI service. A
separate IsolationForest view ranks audits that look unusual relative to their
department peers. The anomaly view is advisory only: it never adds points and
never changes the deterministic risk score.

> **Synthetic data only.** Every audit, control, finding and action in this
> repository is fictional and generated from seed `42`. No real company records
> are used. The project does not claim accuracy, precision or recall, because
> there are no ground-truth risk or anomaly labels.

**Status:** Phases 1-3 complete, plus the read-only list endpoints the frontend
needs. The frontend is complete: M1 shell, M2 dashboard, M3 audit register, M4
finding register, M5 action-plan register and M6 anomaly register. 139 backend
tests and 72 frontend unit tests passing.

---

## Contents

- [What it does](#what-it-does)
- [Stack](#stack)
- [Repository layout](#repository-layout)
- [Setup](#setup)
- [API](#api)
- [Frontend](#frontend)
- [Risk rules](#risk-rules)
- [Risk bands](#risk-bands)
- [Anomaly detection](#anomaly-detection)
- [Tests](#tests)
- [Observed baseline](#observed-baseline)
- [Limitations](#limitations)
- [Documentation](#documentation)

---

## What it does

1. **Stores** four audit entities in PostgreSQL: `audits`, `controls`,
   `findings` and `action_plans`.
2. **Scores** the portfolio, departments and individual findings at an explicit
   `as_of` date using rules R1-R6. Every point is traceable to a rule, an entity
   and a numeric explanation.
3. **Ranks** audits by peer-relative unusualness with an IsolationForest. Rule
   points are joined afterwards as context, never as model input.

The risk engine is pure with respect to application state: for the same data
and `as_of`, it returns the same result. Nothing is cached or stored, and no
endpoint reads the system clock.

## Stack

| Component | Version |
|---|---|
| Python | 3.13.16 |
| FastAPI | 0.162.0 |
| Uvicorn | 0.54.0 |
| Pydantic | 2.14.2 |
| SQLAlchemy | 2.1.6 |
| Alembic | 1.20.1 |
| PostgreSQL driver (psycopg) | 3.3.6 |
| pandas | 3.1.0 |
| scikit-learn | 1.9.1 |
| pytest | 9.2.0 |

Direct dependencies are pinned in `requirements.txt`.

The frontend is a separate Vite application under `frontend/`:

| Component | Version |
|---|---|
| React | 19.3.1 |
| React Router | 7.18.5 |
| Vite | 8.3.5 |
| TypeScript | 5.9.3 |
| Tailwind CSS | 4.3.4 |
| Recharts | 3.10.1 |
| Vitest | 5.1.0 |

## Repository layout

```
backend/
  alembic/                     Alembic environment and migrations
  app/
    api/                       HTTP routers: risk, anomalies
    core/config.py             Settings loaded from the root .env
    db/session.py              Engine and get_db dependency
    models/                    SQLAlchemy models and enums
    modules/
      synthetic_data/          Generator, validator, loader, CLI
      risk_monitoring/         Rules, engine, result dataclasses
      anomaly_detection/       Features, detector, service
    schemas/                   Pydantic response models
    main.py                    FastAPI app and health endpoints
data/synthetic/                Generated CSV exports (gitignored)
docs/PROGRESS.md               Milestone log and design decisions
tests/                         PostgreSQL-backed test suite
frontend/
  src/api/                     Fetch client and response type contracts
  src/components/layout/       App shell, sidebar, topbar and page header
  src/components/ui/           Shared read-only UI primitives
  src/hooks/                   Data fetching and the URL-synced as_of control
  src/lib/                     Formatting, labels and severity mappings
  src/pages/                   Dashboard (M2), audit register (M3), finding register
                               (M4), action-plan register (M5) and anomaly
                               register (M6)
  vite.config.ts               Dev server and /api proxy to FastAPI
```

The database schema is intentionally four tables. Derived values such as
overdue flags, recurrence clusters, risk bands and anomaly scores are computed
at query time and are not stored.

## Setup

### Prerequisites

- Python 3.13
- A running PostgreSQL server
- PowerShell examples below; run commands from the repository root

### 1. Create the virtual environment and install dependencies

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

### 2. Configure the database URL

```powershell
Copy-Item .env.example .env
```

Edit `.env` and set `DATABASE_URL`:

```dotenv
DATABASE_URL=postgresql+psycopg://postgres:YOUR_PASSWORD@localhost:5432/risklens_ai
```

Create the `risklens_ai` database (or whatever name you chose) with your normal
PostgreSQL tooling. The application does not create databases.

### 3. Apply migrations

```powershell
.\.venv\Scripts\alembic.exe upgrade head
.\.venv\Scripts\alembic.exe current
```

Expected head revision:

```
41fcb31467c6 (head)
```

The revision that creates the four audit tables is
`backend/alembic/versions/20261103_41fcb31467c6_create_audit_domain_tables.py`.

### 4. Load the synthetic dataset

```powershell
$env:PYTHONPATH="backend"
.\.venv\Scripts\python.exe -m app.modules.synthetic_data.cli --load
```

The loader validates first, then writes the dataset. A rerun with the same seed
is a no-op. Use `--reset-synthetic` to delete synthetic rows and reload after
changing the dataset shape.

Useful CLI flags:

| Flag | Default | Purpose |
|---|---|---|
| `--seed` | `42` | Random seed |
| `--reference-date` | `2026-10-31` | Dataset anchor date (ISO) |
| `--audits` | `60` | Number of audit engagements |
| `--out-dir` | none | Optional CSV export directory |
| `--load` | off | Validate, then write to the database |
| `--reset-synthetic` | off | Delete synthetic rows and reload |
| `--json` | off | Print reports as JSON |

Generate and validate in memory without touching the database:

```powershell
$env:PYTHONPATH="backend"
.\.venv\Scripts\python.exe -m app.modules.synthetic_data.cli --out-dir data\synthetic
```

### 5. Run the API

```powershell
$env:PYTHONPATH="backend"
.\.venv\Scripts\uvicorn.exe app.main:app --reload
```

Open `http://127.0.0.1:8000/docs` for the interactive OpenAPI schema.

### 6. Run the frontend

The frontend needs Node.js 20.19+ (or 22.12+) and the backend running on port
`8000`. In a second terminal:

```powershell
Set-Location frontend
Copy-Item .env.example .env.local
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. Vite serves the app and proxies `/api/*` to
`http://127.0.0.1:8000`, so the backend needs no CORS change.

## API

All endpoints are read-only and accept an optional `as_of` date:

```
?as_of=2026-10-31
```

`as_of` defaults to the fixed synthetic reference date `2026-10-31` so demos
are reproducible. An invalid date returns `422`.

### Health

| Method | Path | Returns |
|---|---|---|
| `GET` | `/health` | Application status |
| `GET` | `/health/database` | Database connectivity check |

### Deterministic risk

| Method | Path | Returns |
|---|---|---|
| `GET` | `/risk/rules` | Rule catalog, thresholds, severity weights and bands |
| `GET` | `/risk/summary?as_of=` | Portfolio score, band, rule breakdown, open findings and ranked departments |
| `GET` | `/risk/departments?as_of=` | Every department's score, band, breakdown and open counts |
| `GET` | `/risk/departments/{department}?as_of=` | One department plus every attributed hit |
| `GET` | `/risk/findings/{finding_ref}?as_of=` | One finding's direct hits and related recurrence clusters |

Department values are `it`, `procurement`, `operations`, `human_resources`,
`finance` and `compliance`.

On `/risk/findings/{finding_ref}`, `score` counts only hits attributed directly
to the finding. Rule 4 recurrence clusters belong to a department, so they
appear under `related_department_hits` and are not added to the finding score.

### Anomalies

| Method | Path | Returns |
|---|---|---|
| `GET` | `/anomalies/audits?as_of=` | Ranked audits, detector metadata, total, flagged count and disclaimer |
| `GET` | `/anomalies/audits/{audit_ref}?as_of=` | One audit with the top three and all 11 feature deviations |

Unknown or ineligible audits return `404`. Ineligible means the audit does not
exist, starts after `as_of`, or has no findings identified by `as_of`.

Each result includes the continuous `anomaly_score`, `score_percentile`, the
advisory `is_anomaly` flag, all raw features, peer-relative deviations and
audit-level rule points joined for context only.

### Audit data

The risk and anomaly endpoints answer analytical questions. These read-only
lists expose the operational records behind them for the frontend.

| Method | Path | Returns |
|---|---|---|
| `GET` | `/audits?as_of=` | Audit directory with status, type, dates, lead auditor and finding/action counts |
| `GET` | `/findings?as_of=` | Findings identified by `as_of`, with audit context, direct risk score/band and rule IDs |
| `GET` | `/actions?as_of=` | Action plans with owner, status, due/completion dates, backend-computed overdue state and R1/R5 hits |

All three return `{ as_of, total, items }` and accept optional filters:

- `/audits`: `department`, `status`, `audit_type`, `search`
- `/findings`: `severity`, `status`, `department`, `audit_ref`, `rule_id`, `search`
- `/actions`: `status`, `department`, `audit_ref`, `finding_ref`, `overdue`, `search`

Overdue uses the same semantics as R1: `due_date < as_of` and not completed by
`as_of`. The frontend never recalculates overdue state, risk points or bands.
`/findings` risk values cover only hits attributed directly to the finding, so
Rule 4 department clusters and Rule 6 control hits are not added to a finding.
Status columns are current-state values, not history; `as_of` filters findings
and affects counts and overdue evaluation.

### Example

```powershell
Invoke-RestMethod http://127.0.0.1:8000/risk/summary | ConvertTo-Json -Depth 5
Invoke-RestMethod "http://127.0.0.1:8000/anomalies/audits?as_of=2026-10-31" | ConvertTo-Json -Depth 5
Invoke-RestMethod "http://127.0.0.1:8000/audits?as_of=2026-10-31" | ConvertTo-Json -Depth 5
Invoke-RestMethod "http://127.0.0.1:8000/findings?severity=critical" | ConvertTo-Json -Depth 5
Invoke-RestMethod "http://127.0.0.1:8000/actions?overdue=true" | ConvertTo-Json -Depth 5
```

## Frontend

The frontend is a read-only React application for an enterprise audit and risk
team. Every number it displays comes from the API; nothing is recalculated in
the browser and no record can be created, edited or deleted.

### M1 scope (complete)

- Vite, TypeScript, Tailwind CSS v4, React Router and Recharts installed.
- Responsive app shell: persistent desktop sidebar, mobile drawer, skip link,
  page header and an API connectivity indicator.
- URL-synced `as_of` control shared by all pages. Links preserve the parameter,
  invalid values fall back to the default and are removed from the URL.
- Shared primitives: badge, button, card, input, select, empty/error/loading
  states, data table and accessible drawer (Escape, focus trap, restore focus).
- Fetch client with typed errors, abort handling and FastAPI validation
  messages; `useApiQuery` exposes loading, error and refetch state.
- Placeholder routes for Dashboard, Audits, Risk findings, Anomalies and Action
  plans, later replaced by the M2-M6 pages. Each placeholder showed an explicit
  "not connected yet" state rather than invented metrics.

### M2 scope (complete)

The Dashboard now composes five read-only API responses requested in parallel:

| Source | Used for |
|---|---|
| `GET /risk/summary` | Portfolio score/band, rule contribution, department ranking, unresolved severity counts |
| `GET /findings` | Status mix, latest identified findings and priority findings |
| `GET /audits` | Status coverage plus audits with open findings or overdue actions |
| `GET /actions` | Action status mix, blocked/overdue totals and most-overdue actions |
| `GET /anomalies/audits` | Top peer-relative anomaly scores and the API disclaimer |

The page adds:

- a five-tile KPI strip for portfolio risk, unresolved findings, audits,
  findings and overdue actions;
- panels for portfolio risk, unresolved severity, department risk, anomaly
  watch, audit coverage, priority findings, findings overview and remediation;
- independent loading, empty and error handling per panel, a partial-data
  banner that retries only failed sources, and a whole-page retry state when all
  five requests fail;
- links that preserve `as_of` when moving to the register pages.

Everything is derived from API values. The browser counts statuses and orders
lists for presentation but never recalculates risk points, bands, overdue flags
or anomaly scores. Priority findings use the finding's direct rule score and
severity, not the portfolio-calibrated `risk_band` label. “Latest findings” uses
the API's newest-first finding list rather than a fabricated activity feed.

`frontend/src/pages/dashboard/dashboardData.ts` holds the presentation-only
aggregations and `dashboardData.test.ts` covers them with Vitest.

### M4 scope (complete)

The finding register reads `GET /findings` for the filtered rows and opens a
detail drawer backed by two scoped risk endpoints:

| Source | Used for |
|---|---|
| `GET /findings` | Rows, direct score/band/rule IDs, severity/status/department/audit filters and register totals |
| `GET /risk/findings/{finding_ref}` | Direct R1/R2/R3/R5 hits with reasons and typed evidence, plus scoped R4 recurrence clusters |
| `GET /risk/departments/{department}` | R6 weak-control context for the finding's department |

The page adds:

- finding-severity, status and department filters plus a 300 ms debounced text
  search, all applied by the API;
- a URL-backed `audit_ref` filter, so the M3 audit drawer's "view findings" link
  opens the matching subset and keeps `as_of`;
- client-side sortable columns over the returned rows and a summary strip for
  matching, high/critical, unresolved and direct-point totals;
- a detail drawer that shows the finding's own severity, the direct score and
  band, and each direct rule hit with its rule name, reason, alert severity,
  points and typed evidence;
- separate R4 recurrence and R6 weak-control sections, each labelled as
  department-level context that is never added to the finding's direct score;
- loading, filtered-empty, date-specific empty, error/retry and partial-data
  states, plus independent error handling for the two detail requests.

`frontend/src/pages/findings/findingRegister.ts` holds sorting and presentation
totals. `frontend/src/lib/ruleEvidence.ts` formats typed evidence and
`frontend/src/components/risk/RuleHitCard.tsx` renders one rule application;
both are shared with the M5 action register and are covered by Vitest. The
detail request adds reasons and evidence, but the register row's `risk_score`,
`risk_band` and `rule_ids` are already API values and are never recalculated in
the browser.

### M5 scope (complete)

The action-plan register reads `GET /actions` for both the filtered rows and the
detail panel:

| Source | Used for |
|---|---|
| `GET /actions` | Rows, owner, status, due/completion dates, API-computed overdue state and days overdue, parent finding/audit context and complete R1/R5 rule hits |

The page adds:

- status, department and overdue filters plus a 300 ms debounced text search,
  all applied by the API;
- URL-backed `audit_ref` and `finding_ref` filters, so the audit drawer and the
  finding drawer can open the matching subset while keeping `as_of`;
- client-side sortable columns over the returned rows and a summary strip for
  matching, overdue, blocked and action-rule-point totals;
- a detail drawer showing status, overdue state, owner and dates, parent
  finding/audit context and every R1/R5 hit with its reason, alert severity,
  points and typed evidence, or an explicit "no action-level rule hits" state;
- loading, filtered-empty, date-specific empty, error/retry and partial-data
  states.

Overdue state and days overdue come from the API using the same rule as R1, so
the browser never re-implements the due-date comparison. R1 and R5 points are
attributed to the action plan and also contribute to the parent finding's direct
score. `frontend/src/pages/actions/actionRegister.ts` holds sorting and
presentation totals and is covered by Vitest.

### M6 scope (complete)

The anomaly register reads the ranked list from `GET /anomalies/audits` and
requests `GET /anomalies/audits/{audit_ref}` only when a detail panel opens:

| Source | Used for |
|---|---|
| `GET /anomalies/audits` | Ranked rows, score, percentile, advisory flag, the three largest deviations, joined rule points/IDs, detector metadata and the API disclaimer |
| `GET /anomalies/audits/{audit_ref}` | All 11 feature deviations and the audit's own disclaimer for the detail panel |

The page adds:

- department and flag-status filters applied in the browser, because the API
  supports only `as_of` on this endpoint. No backend filter was added;
- client-side sortable columns with natural directions (score, percentile, flag
  and rule points descending; audit and department ascending) and a stable API
  rank column that keeps its position from the original ranked list even when
  the table is re-sorted or filtered;
- a summary strip for matching audits, advisory flags, highest score and joined
  rule points;
- a detail drawer with score, percentile, API rank and context-only rule points,
  the API disclaimer, all 11 peer-relative deviations ordered by absolute robust
  z-score, detector configuration and links to the matching findings and action
  registers;
- loading, filtered-empty, date-specific empty, error/retry and partial-data
  states, plus an independent error state for the detail request.

Scores, percentiles, flags and deviations are never recalculated in the browser.
`frontend/src/lib/anomalyFeatures.ts` only chooses a unit and precision for each
feature, and `frontend/src/pages/anomalies/anomalyRegister.ts` holds filtering,
sort comparators and presentation totals; both are covered by Vitest.

Rule points and rule IDs are shown as context joined after scoring. They are
never model inputs, and the UI labels them that way.

### Environment

`frontend/.env.example` documents the three variables:

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | `/api` | Public API prefix; proxied by Vite in development |
| `VITE_DEFAULT_AS_OF` | `2026-10-31` | Default evaluation date for every page |
| `API_PROXY_TARGET` | `http://127.0.0.1:8000` | Dev-server proxy target; never bundled |

Only `VITE_` variables reach the browser, and none of them is a secret. The
backend database URL stays in the root `.env`.

### Scripts

Run from `frontend/`:

| Command | Purpose |
|---|---|
| `npm run dev` | Development server on port 5173 |
| `npm run build` | Typecheck (`tsc --noEmit`) and production build |
| `npm run typecheck` | TypeScript only |
| `npm test` | Vitest presentation-helper tests |
| `npm run preview` | Serve the production build on port 4173 |

### Behaviour notes

- `as_of` is validated as a real ISO calendar date, so `2026-02-31` is rejected
  instead of rolling over to March.
- Rule-hit severity is alert severity and is kept distinct from finding
  severity.
- Status columns are current-state values, not history; `as_of` filters
  findings and affects counts and overdue evaluation.
- Anomaly views will describe audits as unusual, never as confirmed fraud or
  misconduct.
- Anomaly scores are advisory and separate from deterministic risk points. The
  register and detail panel label rule points and rule IDs as context that never
  feeds the model.
- The anomaly register's department and flag filters run in the browser because
  the endpoint accepts only `as_of`. Filtered totals therefore describe the rows
  the API returned, and a partial response is called out in a banner.
- The displayed API rank is the position in the original ranked list. It does
  not change when a column is sorted or a filter is applied.
- Dashboard severity counts come from `/risk/summary.open_findings`; the
  findings register supplies the status mix. The same number can therefore
  appear in two panels for different reasons, and both are API-provided.
- Action overdue state is never derived in the browser: panels use the
  `is_overdue` and `days_overdue` fields returned by `/actions`. Clearing the
  action register's filters removes only `audit_ref` and `finding_ref`, so the
  evaluation date survives.
- A finding's direct score sums only hits attributed to it. R4 recurrence
  clusters belong to the department and R6 hits to its controls, so neither is
  ever added to a finding score or used to change its band.
- Finding severity is an attribute of the finding. Alert severity describes one
  rule hit and can differ; the register header and detail panel say "Finding
  severity", and rule cards say "Alert severity".

## Risk rules

Every threshold lives in `backend/app/modules/risk_monitoring/rules.py`. The
engine reads these constants and never changes them at runtime.

### Severity weights

Used by Rules 1 and 5, and reported by `/risk/rules`:

| Finding severity | Points |
|---|---|
| low | 2 |
| medium | 5 |
| high | 10 |
| critical | 20 |

### Rule catalog

| ID | Rule | Entity | Points |
|---|---|---|---|
| `R1_overdue_action` | Overdue action plan | action plan | Severity weight x aging multiplier |
| `R2_unresolved_critical` | Unresolved critical finding | finding | 20 base, +10 if older than 30 days, +10 more if older than 90 days |
| `R3_stale_finding` | Stale non-critical finding | finding | High 8 after 60 days, medium 4 after 90 days, low 2 after 120 days |
| `R4_repeated_findings` | Repeated findings | department | 5 points per finding beyond the first two in a cluster, capped at 25 |
| `R5_blocked_action` | Blocked action plan | action plan | Parent finding severity weight |
| `R6_weak_control` | Weak control | control | Ineffective 15, partially effective 6 |

Details:

- **R1 - overdue action.** An action counts as completed when its status is
  `completed` or its completion date is on or before `as_of`. Otherwise, if its
  due date is before `as_of`, it scores `round_half_up(severity_points x
  multiplier)` with aging buckets `<=30` days `1.0`, `<=60` `1.5`, `<=90` `2.0`
  and `>90` `2.5`. Rounding is half-up, not Python's banker's rounding.
- **R2 - unresolved critical.** Applies to critical findings still `open` or
  `in_progress`. Base 20 points, plus 10 once the finding is older than 30 days,
  plus another 10 once it is older than 90 days.
- **R3 - stale non-critical.** Applies to open or in-progress high, medium and
  low findings that exceed their remediation SLA. Critical findings are
  excluded here because R2 already scores them.
- **R4 - repeated findings.** At least three findings in the same department
  share a root-cause category inside the 180-day window ending at `as_of`.
  Points are `(count - 2) x 5`, capped at 25. The hit belongs to the
  department, not to a single audit.
- **R5 - blocked action.** A blocked, not-completed action scores the parent
  finding's severity weight. A blocked action may also be overdue under R1;
  this overlap is intentional.
- **R6 - weak control.** An active control that is `ineffective` scores 15;
  `partially_effective` scores 6. Inactive and retired controls are excluded.

Portfolio score is the sum of all hits. Department score is the sum of hits
attributed to that department. Open findings by severity are reported as
context only and never add points.

The rule catalog is also available at runtime from `GET /risk/rules`, including
the exact constants used to score each rule.

## Risk bands

| Band | Score range |
|---|---|
| low | 0-74 |
| medium | 75-149 |
| high | 150-299 |
| critical | 300+ |

Bands are calibrated against the synthetic dataset, not an industry standard.
Changing them is a deliberate, reviewable decision.

## Anomaly detection

The anomaly view answers "which audits look unlike their peers?", not "which
audits are bad?". It is supplementary and read-only.

### Eligibility

An audit is scored when:

- its `start_date` is on or before `as_of`; and
- it has at least one finding identified on or before `as_of`.

Audits with no findings are excluded rather than left for the model to explain.
On the synthetic dataset this yields 56 eligible audits from 60.

### Features

The model uses 11 audit-level features, built in
`backend/app/modules/anomaly_detection/features.py`:

| Feature | Definition |
|---|---|
| `finding_count` | Number of findings in the audit identified by `as_of` |
| `critical_unresolved_count` | Critical findings still open or in progress |
| `high_critical_share` | Share of findings that are high or critical |
| `overdue_action_rate` | Overdue actions divided by all actions in the audit |
| `mean_days_overdue` | Mean days past due across overdue actions |
| `blocked_action_count` | Blocked, not-completed actions |
| `weak_control_finding_share` | Share of findings linked to an active weak control |
| `unactioned_finding_share` | Share of action-required findings with no action plan |
| `resolved_share` | Share of findings with status `resolved` |
| `root_cause_diversity` | Distinct root causes divided by finding count |
| `mean_remediation_window_days` | Mean `(due_date - identified_date)` across actions |

Missing remediation windows are filled with the department median, then the
global median, then zero.

### Detector

- Normalization is department-relative: median and median absolute deviation
  (MAD) per feature.
- If a department has fewer than 8 eligible audits, or a feature's MAD is zero,
  the global distribution is used instead.
- Normalized inputs are clipped to `[-5, 5]` before fitting so one extreme value
  cannot dominate the forest. Explanations report the unclipped deviation.
- Model: `IsolationForest(n_estimators=200, contamination=0.10,
  random_state=42, n_jobs=1)`.
- `anomaly_score` is the negated `score_samples` value: higher means more
  unusual.
- `score_percentile` is the percentage of scored audits at or below that score.
- `is_anomaly` is an advisory cut at the fixed contamination of `0.10`. The
  continuous score and percentile are the primary output.
- The ranked list reports the three largest non-zero deviations. The detail
  endpoint reports all 11, ordered by absolute robust z-score.

Rule points and rule IDs are joined after scoring for display only. They are
never model inputs and cannot change an anomaly result.

## Tests

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

Expected result:

```
139 passed, 1 warning
```

The warning is a third-party `StarletteDeprecationWarning` about `httpx` versus
`httpx2`; it does not affect the suite.

Frontend unit tests:

```powershell
Set-Location frontend
npm test
```

Vitest runs 72 presentation-helper tests covering dashboard aggregations, audit
register sorting/totals, finding register sorting/totals, typed evidence
formatting, action register sorting/totals, anomaly register
filtering/sorting/totals and anomaly feature formatting. They do not duplicate
backend scoring.

| Frontend area | Tests |
|---|---|
| Dashboard aggregations | 13 |
| Audit register | 9 |
| Finding register | 10 |
| Shared rule evidence | 10 |
| Action register | 10 |
| Anomaly register | 12 |
| Anomaly feature formatting | 8 |

Test coverage:

| Area | Tests |
|---|---|
| Schema, models, config, generator, validator, loader | 34 |
| Rule boundaries and engine integration | 70 |
| Risk API contract | 11 |
| Anomaly features and detector | 11 |
| Anomaly API contract | 6 |
| Audit data list API contract | 7 |

Tests require a valid `.env`. They derive `risklens_ai_test` from
`DATABASE_URL`, drop and recreate that database at session start, apply the real
Alembic history and roll back each test. They never touch `risklens_ai`.

## Observed baseline

With seed `42` and `as_of=2026-10-31`:

**Dataset:** 60 audits, 30 controls, 197 findings, 165 action plans (452 rows).

**Deterministic risk:** 1,450 points, band `critical`, 123 rule hits.

| Department | Score |
|---|---|
| IT | 530 |
| Procurement | 356 |
| Operations | 179 |
| Human Resources | 167 |
| Finance | 121 |
| Compliance | 97 |

**Anomalies:** 56 eligible audits, 6 advisory flags. The top-ranked audit is
`AUD-2025-0005` (IT, score 0.601, percentile 100.0) with zero rule points, which
illustrates that unusual and rule-risky are different questions.

**Anomaly register:** the default ranking opens on score descending with all 56
audits, 6 flags and 1,227 joined rule points. Department filters return IT 8
rows/2 flags, Finance 10/2, Procurement 11/2, Operations 12/0, Compliance 8/0
and Human Resources 7/0. Flagged-only returns 6 and not-flagged 50. The last
ranked audit, `AUD-2026-0018` (score 0.358, percentile 1.8), carries 88 context
rule points and the R1/R2/R3/R5 IDs.

`AUD-2025-0005`'s 11 deviations are ordered by absolute robust z-score:
`mean_remediation_window_days` +3.73, `resolved_share` +2.85,
`weak_control_finding_share` -2.56, then smaller values down to zero. Detector
metadata is `IsolationForest`, 200 estimators, 0.10 contamination, random state
42, minimum 8 peer audits and 11 features.

**Audit data lists:** 60 audits, 197 findings, 165 action plans, 37 overdue
actions, and 58 findings with a direct risk score above zero.

**Finding detail:** `FND-2026-0087` (IT, critical, open) has a direct score of 30
from one R2 hit. Its detail response also returns one R4 recurrence cluster
(5 points, high) and three R6 weak-control hits (15, 6 and 6 points, medium).
Those are displayed as department context and are not added to the direct score.

**Action register:** 165 action plans at the same date, 37 overdue and 8 blocked,
carrying 529 R1/R5 rule points. Action #177 is blocked and 626 days overdue, with
one R1 and one R5 hit worth 7 points in total. At `2026-06-30` the register holds
123 actions with 20 overdue.

**Dashboard:** at the same date the KPI strip shows portfolio risk `1,450`
(critical, 123 hits), 70 unresolved findings (13 critical), 60 audits, 197
findings and 37 overdue actions. The panels show 56 eligible anomaly audits with
6 advisory flags. These are API values, not frontend calculations.

Requesting anomalous audits does not change `/risk/summary`: it remains 1,450
points with 123 hits before and after. Requesting the audit data lists also
leaves the risk and anomaly results unchanged.

These numbers are regression facts for this synthetic dataset, not quality
metrics.

## Limitations

- **Synthetic data only.** No real audit records are used.
- **No ground-truth anomaly labels.** No accuracy, precision or recall is
  reported. Anomaly output is descriptive and advisory.
- **"Unusual" is not "bad".** A deviation can point above or below the peer
  median, such as unusually fast resolution.
- **Current-state columns.** `findings.status` and `controls.status` are
  current-state, not history. The engine treats them as the state at `as_of`.
  This is exact for the reference date and an approximation for earlier dates.
- **Cross-table validation.** `findings.identified_date >= audits.start_date`
  is enforced by the validation layer and tests, not by a database CHECK.
- **`updated_at` is ORM-only.** Bulk SQL updates must set it explicitly.
- **Reloading after schema changes.** A plain `--load` does not delete renamed
  or removed refs; use `--reset-synthetic`.
- **IsolationForest version sensitivity.** Scores can change across
  scikit-learn versions. Dependencies are pinned, and the observed counts are a
  regression baseline, not a quality claim.
- **Rule 4 is department-level.** Its points are not attributed to a single
  audit and therefore do not appear in an audit's `rule_points`.
- **Bands are synthetic-calibrated.** They are not an industry benchmark.
- **No production hardening.** There is no authentication, pagination, rate
  limiting, caching or deployment configuration. Every request recomputes its
  result from the database.

## Documentation

- `docs/PROGRESS.md` - milestone log, design decisions, test coverage and the
  detailed behavior of each phase.
- `frontend/` - the read-only React application. Its environment variables and
  scripts are documented in the [Frontend](#frontend) section above.

Run Alembic from the repository root; the URL comes from `.env` and is
deliberately absent from `alembic.ini`:

```powershell
.\.venv\Scripts\alembic.exe current
.\.venv\Scripts\alembic.exe upgrade head
.\.venv\Scripts\alembic.exe check
```

Never run `downgrade base` against `risklens_ai`; it drops the audit tables.
