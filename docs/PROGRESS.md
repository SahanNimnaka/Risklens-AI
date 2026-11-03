# RiskLens AI - Milestone Log

Synthetic-data-only project. No real company audit records are used.

## Phase 1 - Audit data model and synthetic dataset

| Step | Scope | Status |
|---|---|---|
| 1.1 | Inspect existing backend, package versions, live DB | Done |
| 1.2 | Propose audit data model | Approved |
| 1.3 | Enums, keys, constraints, indexes, relationships | Approved |
| 1.4 | SQLAlchemy models + shared base + `get_db` | Validated (imports, mappers, DDL compile) |
| 1.5 | Alembic configuration and initial migration | Done - revision `41fcb31467c6` applied |
| 1.6 | Synthetic dataset design and generator | Done - seed 42, 60 audits / 30 controls / 197 findings / 165 actions |
| 1.7 | Repeatable, validated, idempotent loader | Done - 452 rows loaded, rerun is a no-op |
| 1.8 | Phase 1 tests | Done - 34 tests against `risklens_ai_test` |

Phase 1 is complete: the schema is migrated, the synthetic dataset is loaded
(452 rows), and the generator, validator and loader are covered by tests.

## Decisions taken

- Four entities only: `audits`, `controls`, `findings`, `action_plans`.
- Enums are stored as `VARCHAR` + `CHECK` (`native_enum=False`) to keep
  Alembic migrations reversible and transaction-safe.
- `controls.status` (lifecycle) is separate from `controls.effectiveness`.
- Recurrence, risk scores, and overdue flags are derived at query time in
  Phase 2; they are not stored on Phase 1 tables.
- `app.core.config` resolves `.env` from the repository root, independent of
  the current working directory.
- Tests will target a dedicated `risklens_ai_test` database (Phase 1.8).
- SQLAlchemy 2.x defaults `Enum(create_constraint=...)` to `False`; the shared
  `enum_type()` helper passes `create_constraint=True`, otherwise enum columns
  would be unconstrained VARCHAR. Verified by compiling PostgreSQL DDL.

## Database operations

Run all Alembic commands from the repository root. The URL comes from `.env`;
it is deliberately absent from `alembic.ini`.

```powershell
.\.venv\Scripts\alembic.exe current            # applied revision
.\.venv\Scripts\alembic.exe upgrade head       # apply pending migrations
.\.venv\Scripts\alembic.exe check              # models vs DB drift
.\.venv\Scripts\alembic.exe revision --autogenerate -m "describe change"
```

Never run `downgrade base` against `risklens_ai`; it drops the audit tables.

## Synthetic dataset (Step 1.6)

The dataset is generated in memory from a fixed seed and a fixed reference
date (`2026-10-31`); nothing reads the system clock. Generation and
validation do not touch the database. CSVs are written to `data/synthetic/`,
which is gitignored because the CLI can always regenerate them.

```powershell
$env:PYTHONPATH="backend"
.\.venv\Scripts\python.exe -m app.modules.synthetic_data.cli --out-dir data\synthetic
```

Dataset at seed 42:

- 60 audits (6 departments, weighted), 30 controls (5 per department),
  197 findings, 165 action plans.
- Findings: 47 low / 57 medium / 63 high / 30 critical;
  30 open / 40 in progress / 105 resolved / 22 accepted.
- Actions: 14 not started / 29 in progress / 114 completed / 8 blocked;
  37 overdue at the reference date.
- 13 unresolved criticals, 79 findings on weak controls (35 on ineffective
  controls), 53 audits with two or more findings, 20 recurring
  department/root-cause clusters within a 180-day window.
- Identical seed produces identical CSV bytes (SHA256 verified across runs).

Validation enforces unique natural keys, enum validity, referential integrity,
temporal consistency (identification inside the audit window, due dates and
completions after identification, no future completions), resolved findings
having a completed action, and minimum business coverage. It fails loudly
rather than emitting a thin or inconsistent dataset.

## Synthetic data loader (Step 1.7)

```powershell
$env:PYTHONPATH="backend"
.\.venv\Scripts\python.exe -m app.modules.synthetic_data.cli --load
.\.venv\Scripts\python.exe -m app.modules.synthetic_data.cli --reset-synthetic
```

`--load` validates first and writes everything in one transaction. `--load`
alone never deletes anything, so a rerun with unchanged data reports
`created=0 updated=0 unchanged=452`. `--reset-synthetic` deletes only rows
whose refs use the synthetic prefixes (`AUD-`, `CTL-`, `FND-`) and then
reloads; hand-written rows are preserved.

Idempotency keys:

- `audits.audit_ref`, `controls.control_ref`, `findings.finding_ref` are the
  natural keys; existing rows are compared field by field and updated only
  when a value differs.
- `action_plans` have no natural key in the schema, so they are matched on
  `(finding_id, action_description, due_date)`. The loader owns the action
  plans of synthetic findings: an action no longer present in the generated
  dataset is removed. Actions on non-synthetic findings are never touched.

Verified behaviour: first load created 452 rows; rerun created and updated
nothing; a deliberately invalid row failed with a `DataError` and rolled the
whole transaction back; reset removed 165/197/30/60 rows in FK order and
recreated them while keeping a manually inserted audit.

## Tests (Step 1.8)

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

The suite runs against `risklens_ai_test`, never `risklens_ai`. `conftest.py`
overrides `DATABASE_URL` before the application settings are imported, drops
and recreates the test database, and applies the real Alembic history. Each
test runs in a transaction that is rolled back, so tests are isolated even
though the loader commits internally.

Coverage (34 tests):

- `test_config.py` - root `.env` resolution, fixed synthetic defaults, and a
  guard that the test session is not pointed at the development database.
- `test_models_constraints.py` - enums are CHECK-constrained VARCHAR (not
  PostgreSQL enums), all 14 CHECK constraints and the eight key indexes exist,
  unique natural keys, date ordering, completed-action rule, FK enforcement,
  `ON DELETE CASCADE` for audits and `ON DELETE SET NULL` for controls.
- `test_synthetic_dataset.py` - byte-for-byte determinism for a fixed seed,
  documented dataset shape, department coverage, rule signal (overdue,
  blocked, critical, recurrence), temporal rules, and rejection of duplicate
  keys, orphan actions, findings outside their audit window, and resolved
  findings with no completed action.
- `test_loader.py` - first load creates 452 rows, rerun is a no-op, changed
  rows are updated and restored, stray actions are removed, reset preserves
  non-synthetic rows, a failed load rolls back, and validation blocks writes.

The duplicate-key test exposed a real bug: validation raised a pandas
`MergeError` instead of `DatasetValidationError` because it joined on duplicate
keys. Validation now stops immediately after the key checks and reports the
structural issue.

## Phase 2 - Deterministic risk monitoring

| Step | Scope | Status |
|---|---|---|
| 2.1 | Rule design, thresholds, bands, API surface | Approved |
| 2.2 | Rule engine and boundary tests | Done - 104 tests passing (34 Phase 1 + 70 Phase 2) |
| 2.3 | Risk API (`/risk/...`) | Done - read-only router under `/risk` |
| 2.4 | API tests | Done - 11 HTTP contract tests |

The engine lives in `backend/app/modules/risk_monitoring/`:

- `rules.py` - the single source of every threshold, weight and band.
- `engine.py` - `compute_risk(session, as_of)`, returning immutable result
  objects (`PortfolioRisk`, `DepartmentRisk`, `RuleHit`, `RuleBreakdown`).
- `__init__.py` - public exports.

### Approved rules

| ID | Rule | Predicate | Points |
|---|---|---|---|
| R1 | Overdue action plan | action not completed by `as_of`, `due_date < as_of` | severity points x aging multiplier (1-30d 1.0, 31-60d 1.5, 61-90d 2.0, >90d 2.5), half-up |
| R2 | Unresolved critical finding | critical, open/in progress, identified on or before `as_of` | 20, +10 if age > 30d, +10 if age > 90d |
| R3 | Stale non-critical finding | high/medium/low unresolved and age > SLA (60/90/120d) | high 8, medium 4, low 2 |
| R4 | Repeated findings | at least 3 findings in the same department and root cause inside the 180-day window ending `as_of` | min(25, (count - 2) x 5) |
| R5 | Blocked action plan | action status blocked and not completed by `as_of` | parent finding severity points |
| R6 | Weak control | active control that is ineffective or partially effective | ineffective 15, partially effective 6 |

Bands: low `< 75`, medium `75-149`, high `150-299`, critical `>= 300`.
Department mapping: findings use their audit's department; actions follow the
finding; controls use their own department; R4 uses the cluster department.
Open findings are returned as context and are never added to the score.

### Full-dataset result at `as_of = 2026-10-31`

| Rule | Hits | Points |
|---|---|---|
| R1 overdue action | 37 | 473 |
| R2 unresolved critical | 13 | 490 |
| R3 stale finding | 43 | 208 |
| R4 repeated findings | 11 | 130 |
| R5 blocked action | 8 | 56 |
| R6 weak control | 11 | 93 |
| **Total** | **123** | **1,450** |

| Department | Score | Band |
|---|---|---|
| IT | 530 | critical |
| Procurement | 356 | critical |
| Operations | 179 | high |
| Human Resources | 167 | high |
| Finance | 121 | medium |
| Compliance | 97 | medium |

### Rounding correction

The design prototype reported 1,444 points because it used pandas `.round()`,
which rounds halves to even. That contradicts the approved half-up rule and
turned six medium-severity actions with a `12.5` exact value into 12 instead of
13. The engine uses explicit half-up rounding, so the correct total is 1,450
and the affected departments shift by the same 6 points (IT +3, Finance +2,
Procurement +1). The integration test now pins 1,450.

### Phase 2 test coverage (70 tests)

- `rules.py` boundaries: band edges, every aging bucket boundary, half-up
  rounding, and the stable rule catalog order.
- R1: aging boundaries, due today is not overdue, completed actions excluded,
  findings identified after `as_of` excluded, half-up values.
- R2: age bonuses at 30/31 and 90/91 days, resolved and accepted excluded.
- R3: strict SLA edges for high/medium/low, criticals excluded, resolved and
  accepted excluded.
- R4: cluster threshold, point cap, inclusive window start, findings before the
  window ignored, any status counted, departments and root causes kept separate.
- R5: parent severity points for all four severities, and intentional overlap
  with R1 for blocked-and-overdue work.
- R6: ineffective/partially effective scoring and exclusion of effective,
  not-tested, inactive and retired controls.
- Roll-ups: department mapping, open-finding context, portfolio sum equals
  department sum, and repeated calls return identical results.
- Integration: full dataset loads and produces the documented totals above.

### Engine limitations

- `findings.status` and `controls.status` are current-state columns, not
  history. An `as_of` in the past is therefore an approximation of the state at
  that date; it is exact for the synthetic reference date.
- Actions have no natural key, so a hit identifies an action as
  `action_plan:{id}` and includes `finding_ref` for traceability.
- R4's backward-looking window is intentionally different from the validator's
  forward-looking recurrence clusters.
- Scores are raw additive sums and are not normalised per audit or per
  department size. Hit counts and per-rule breakdown are returned so a high
  score can be read as "more exceptions", not automatically "worse per audit".

### Risk API (Steps 2.3-2.4)

Files:

- `backend/app/schemas/risk.py` - response models for hits, breakdowns,
  department summaries, portfolio summary, finding detail and the rule catalog.
- `backend/app/api/risk.py` - read-only router, mounted in `app/main.py`.

| Endpoint | Returns |
|---|---|
| `GET /risk/rules` | Six rules, exact scoring constants, severity weights and score bands |
| `GET /risk/summary?as_of=` | Portfolio score, band, total hits, rule breakdown, open-finding context and ranked departments |
| `GET /risk/departments?as_of=` | Every department with score, band, hit count, rule breakdown and open-finding context |
| `GET /risk/departments/{department}?as_of=` | One department plus every attributed rule hit |
| `GET /risk/findings/{finding_ref}?as_of=` | Finding metadata, direct hits and related Rule 4 clusters |

`as_of` defaults to the fixed synthetic reference date (`2026-10-31`). Each hit
contains its rule id, points, entity reference, department, reason sentence and
typed evidence, so the HTTP response explains the score rather than only
reporting it.

The finding endpoint separates hits attributed directly to the finding (Rule 2,
Rule 3, and its actions under Rules 1 and 5) from related Rule 4 clusters. Rule 4
points belong to the department, so they appear under
`related_department_hits` and are not added to the finding's `score`. If the
finding was identified after `as_of`, it is returned with
`included_in_scoring: false` and no hits.

Run locally:

```powershell
$env:PYTHONPATH="backend"
.\.venv\Scripts\uvicorn.exe app.main:app --reload
```

Then open `http://127.0.0.1:8000/docs` or call the endpoints directly. A
read-only smoke test against the development database returned `200` for all
five endpoints, with portfolio score `1,450`, `123` hits, IT `530` and
Procurement `356`.

### API test coverage (11 tests)

- Rule catalog: rule order, every band edge, severity weights, R1 half-up
  rounding and R6 points.
- Summary: default reference date, explicit `as_of` changing which findings are
  scored, and a `422` for an invalid date.
- Departments: ranking, hit counts, six-rule breakdown, open-finding context,
  full detail hits, and `422` for an unknown department.
- Findings: direct Rule 2 hit plus a related Rule 4 cluster whose points are
  excluded from the finding score, `404` for an unknown ref, and an unscored
  future finding.
- Full dataset through HTTP: portfolio `1,450` / `123` hits, all department
  scores, and IT detail `530` across `41` hits.

`TestClient` emits one third-party `StarletteDeprecationWarning` about `httpx`
versus `httpx2`. It comes from the installed Starlette/FastAPI combination, not
from the project code, and does not affect behaviour. The project keeps its
pinned dependency set rather than adding a package solely to silence it.

## Phase 3 - Anomaly detection

| Step | Scope | Status |
|---|---|---|
| 3.1 | Design: features, detector, evaluation, API | Done - approved |
| 3.2 | Feature builder, detector and unit tests | Done - 11 tests |
| 3.3 | Anomaly API and HTTP tests | Done - 6 tests; 132 total passing |

Anomaly detection is a separate, supplementary view. It never changes the
deterministic risk score, never adds points and never replaces a rule. Its job
is to rank audits that look unusual relative to their department peers.

### Detector

- `sklearn.ensemble.IsolationForest` with `n_estimators=200`,
  `contamination=0.10`, `random_state=42`, `n_jobs=1`.
- One row per audit that started on or before `as_of` **and has at least one
  finding identified by `as_of`**. Clean audits with no findings are out of
  scope for a risk-relevant anomaly view.
- Features are normalized within the audit's department (median/MAD). If a
  department has fewer than 8 audits, or a feature has zero MAD, normalization
  falls back to the global distribution. Normalized inputs are clipped to
  `[-5, 5]` for model stability; explanations report the unclipped value.
- Anomaly score is `-score_samples`, reported with a rank percentile.
  `is_anomaly` is the model's `-1` prediction at the configured contamination.
- Rule points are joined for context only; they are never model inputs.

### Features

| Feature | Definition |
|---|---|
| `finding_count` | findings identified by `as_of` |
| `critical_unresolved_count` | critical findings still open or in progress |
| `high_critical_share` | high plus critical findings divided by all findings |
| `overdue_action_rate` | overdue actions divided by all actions |
| `mean_days_overdue` | mean lateness among overdue actions, zero if none |
| `blocked_action_count` | blocked actions not completed by `as_of` |
| `weak_control_finding_share` | findings linked to active weak controls |
| `unactioned_finding_share` | non-accepted findings with no action plan |
| `resolved_share` | resolved findings divided by all findings |
| `root_cause_diversity` | distinct root causes divided by findings |
| `mean_remediation_window_days` | mean `due_date - identified_date`; neutral imputation when no actions exist |

### Output and API

Every result reports `audit_ref`, `audit_title`, `department`, `anomaly_score`,
`score_percentile`, `is_anomaly`, `rule_points`, `rule_ids` and the raw feature
values. The ranked list includes the top three peer-relative deviations; the
detail endpoint includes all 11 deviations with direction and peer median. The
explanation is deterministic and says "unusual", never "bad".

Endpoints:

- `GET /anomalies/audits?as_of=` - ranked audit results, all scored audits, plus
  detector metadata, total, flagged count and a disclaimer.
- `GET /anomalies/audits/{audit_ref}?as_of=` - one audit with all feature
  deviations, or `404` when the audit is unknown or has no eligible findings.

### Evaluation policy

There are no ground-truth anomaly labels. We will not report accuracy,
precision or recall. Evaluation will be descriptive:

- same input and seed produce identical scores and flags;
- contamination sensitivity at 0.05, 0.10 and 0.15, reported as overlap;
- overlap with deterministic rule points, including flagged audits with zero
  or low rule points;
- manual inspection of the top results and their explanations.

The prototype found that global normalization mostly re-ranked audits already
covered by rules. Department-relative normalization surfaced audits with zero
rule points, including audits with findings but unusual remediation patterns.
That is the reason for the peer-relative design.

With the final proposed feature set and the finding-count filter, the prototype
scored 56 audits and flagged 6 at contamination `0.10`. Five flagged audits had
rule points and one had none; four had fewer than 20 rule points. Overlap with
the `0.10` flags was Jaccard `0.50` at `0.05` and `0.33` at `0.15`, so the
binary flag is sensitive to the configured contamination. The continuous score
and percentile are therefore the primary output; `is_anomaly` is an advisory
cut, not a discovered truth. These are prototype observations on synthetic
data, not accuracy measurements.

### Implementation (Step 3.2)

Files:

- `backend/app/modules/anomaly_detection/features.py` - `build_feature_frame`
  and the ordered `FEATURE_NAMES` contract.
- `backend/app/modules/anomaly_detection/detector.py` -
  `normalize_features`, `detect_anomalies`, and the frozen result dataclasses
  `FeatureDeviation`, `AuditAnomaly`, `AnomalyDetection`, `PeerNormalization`.
- `backend/app/modules/anomaly_detection/__init__.py` - public exports.
- `tests/test_anomaly_detection.py` - 11 tests.

Implementation details:

- The feature frame is sorted by `audit_ref`; the detector re-sorts defensively,
  so callers cannot change fitting or output order.
- Department statistics are used only when the department has at least
  `MIN_PEER_AUDITS = 8` rows and non-zero MAD. Otherwise the row keeps the
  global median and global z-score. The reported `peer_median` is the median
  actually used for that row.
- Normalized inputs are clipped to `[-5, 5]`; deviations report the unclipped
  robust z-score.
- `score_percentile` uses a max rank (`rank(method="max", pct=True) * 100`), so
  the most anomalous audit reports `100.0`.
- Deviations are limited to the three largest non-zero absolute z-scores, with
  the fixed feature order as the tie-break. Direction is `above_peer`,
  `below_peer` or `at_peer`.
- An empty eligible frame returns an empty `AnomalyDetection` rather than
  raising.
- The detector never imports or receives rule points; the risk engine is only
  used by the tests to prove the result is unchanged.

### Step 3.2 test coverage (11 tests)

- Eligibility: clean audits, future audits and post-`as_of` findings excluded.
- All 11 feature definitions, including overdue, blocked, accepted and
  unactioned semantics.
- Department-median imputation and global-median fallback for missing action
  windows.
- Department/global fallback for small departments and zero-MAD departments.
- Deterministic output under row shuffling, ordering, percentile bounds,
  deviation ordering and direction.
- Empty frames and missing-column validation.
- Risk isolation: `compute_risk` is equal before and after detection; the frame
  has no rule-score columns and results have no `rule_points`.
- Full synthetic dataset: 56 eligible audits and 6 advisory flags, with two
  detections producing equal results.

### Step 3.2 observations on the development database

The implemented detector reproduces the approved prototype exactly:

```
eligible=56 flagged=6
flagged with any rule points: 5 | zero rule points: 1 | <20 rule points: 4
risk total: 1450 hits: 123
```

Top flag: `AUD-2025-0005` (IT, zero rule points), driven by an unusually long
mean remediation window and a fully resolved set of findings. Other flags
include unusually high overdue days and unusually varied root causes. These are
synthetic observations, not accuracy measurements.

Two implementation bugs were found and fixed by the new tests:

- fallback rows initially reported their department median even when the
  global fallback supplied the z-score; the reported median now matches the
  statistics actually used;
- one explanation lookup used a positional index against a label-indexed
  Series; it now uses positional access.

### Implementation (Step 3.3)

Files:

- `backend/app/modules/anomaly_detection/service.py` - `compute_anomalies`,
  `get_audit_anomaly` and the report dataclasses. Joins audit-level rule points
  and rule ids for display only.
- `backend/app/schemas/anomaly.py` - response models for deviations, ranked
  audits, detail results, detector metadata and the list envelope.
- `backend/app/api/anomaly.py` - read-only `/anomalies` router.
- `backend/app/main.py` - includes the anomaly router alongside `/risk`.
- `tests/test_anomaly_api.py` - 6 HTTP contract tests.
- `backend/app/modules/anomaly_detection/detector.py` - `AuditAnomaly` now keeps
  `all_deviations` for the detail endpoint; the ranked list still uses the top
  three non-zero deviations.

Contract details:

- `as_of` defaults to `2026-10-31`; an invalid date returns `422`.
- Unknown or ineligible audit refs return `404`.
- `rule_points` and `rule_ids` are audit-level context. Department-level Rule 4
  clusters have no `audit_ref`, so they are not attributed to an audit.
- The list response exposes the fixed detector configuration and a disclaimer
  that anomaly scores are advisory and not accuracy measurements.
- The detail response includes `as_of`, the same audit fields, the top-three
  `deviations` and all 11 `all_deviations`.

### Step 3.3 test coverage (6 tests)

- List: two-audit scenario, ranked order, detector metadata, disclaimer, rule
  points and rule ids, zero-rule audit, top-three deviations.
- List: `as_of` excludes findings identified after the date and returns an empty
  payload before they exist.
- List: invalid `as_of` returns `422`.
- Detail: all 11 deviations, ordered by absolute robust z, plus rule context.
- Detail: `404` for an unknown ref and for an audit with no eligible findings.
- Full dataset: 56 audits, 6 flags, top flag `AUD-2025-0005` with zero rule
  points, detail returns 11 deviations, and `/risk/summary` is identical before
  and after the anomaly request (1,450 / 123).

### Step 3.3 smoke test on the development database

```
/anomalies/audits -> 200
/anomalies/audits/AUD-2025-0005 -> 200
/anomalies/audits/AUD-DOES-NOT-EXIST -> 404
/risk/summary -> 200
anomalies: 2026-10-31 total 56 flagged 6 detector IsolationForest 0.1
top: AUD-2025-0005 it 0.601 100.0 rule_points 0
detail: AUD-2025-0005 deviations 3 all_deviations 11
risk: 1450 critical 123
```

Run locally:

```powershell
$env:PYTHONPATH="backend"
.\.venv\Scripts\uvicorn.exe app.main:app --reload
```

Then open `http://127.0.0.1:8000/docs`; both `/risk` and `/anomalies` appear in
the schema. No database writes are made by either router.

## Phase 4 - Integration and documentation

| Step | Scope | Status |
|---|---|---|
| 4.1 | Top-level README covering setup, API, rules, anomalies and limits | Done |

`README.md` is the single entry point for the project. It documents:

- the synthetic-data-only scope and the absence of quality metrics;
- verified stack versions and the four-table architecture;
- setup from virtual environment through migrations and dataset loading;
- both API surfaces, including `as_of` defaults and error behavior;
- the full R1-R6 rule catalog, severity weights and band boundaries;
- the 11 anomaly features, normalization, detector parameters and output
  semantics;
- the test command, observed dataset baseline and known limitations.

The README uses only commands and values observed in this repository. It does
not claim accuracy, precision or recall, and it states explicitly that anomaly
results are advisory and cannot change the deterministic score.

## Phase 5 - Frontend readiness (M0)

| Step | Scope | Status |
|---|---|---|
| M0.1 | Identify API gaps for the requested frontend pages | Done - `/audits`, `/findings`, `/actions` missing |
| M0.2 | Add minimal read-only list endpoints and response schemas | Done |
| M0.3 | HTTP contract tests, including full-dataset baselines | Done - 7 tests |
| M0.4 | Documentation update | Done |

The frontend needs audit, finding and action registers that the risk and
anomaly routers do not provide. M0 adds three additive, read-only endpoints. It
does not change the schema, models, migrations, scoring rules or existing
contracts, and it performs no writes.

Files:

- `backend/app/schemas/audit_data.py` - list item and envelope models for the
  three endpoints.
- `backend/app/api/audit_data.py` - read-only router; reuses
  `compute_risk(session, as_of)` and the engine's `_completed_by` so risk
  points, bands and overdue state stay backend-owned.
- `backend/app/main.py` - mounts the new router alongside `/risk` and
  `/anomalies`.
- `tests/test_audit_data_api.py` - 7 HTTP contract tests.

Contract:

| Endpoint | Items | Filters |
|---|---|---|
| `GET /audits?as_of=` | Audits started by `as_of`, with finding/open-finding/action/overdue-action counts | `department`, `status`, `audit_type`, `search` |
| `GET /findings?as_of=` | Findings identified by `as_of`, with audit context, direct risk score/band and rule IDs | `severity`, `status`, `department`, `audit_ref`, `rule_id`, `search` |
| `GET /actions?as_of=` | Actions for visible findings, with owner, dates, overdue state and R1/R5 hits | `status`, `department`, `audit_ref`, `finding_ref`, `overdue`, `search` |

Each returns `{ as_of, total, items }` with deterministic ordering. Overdue is
`due_date < as_of` and not completed by `as_of`, matching R1. `/findings`
includes only hits attributed directly to the finding (R1, R2, R3, R5); R4
department clusters and R6 control hits remain entity-level. Rule-hit
`severity` is alert severity and is distinct from the finding's severity.

### M0 validation

- `pytest tests/test_audit_data_api.py -q`: 7 passed.
- Full suite: 139 passed, one third-party `StarletteDeprecationWarning`.
- Development-database smoke test: `/audits` 60, `/findings` 197 (58 with direct
  risk above zero), `/actions` 165 with 37 overdue. `/risk/summary` remained
  1,450 points and 123 hits.
- The first test run found three incorrect test expectations, not engine bugs:
  a helper's default audit end date preceded its start date, and two expected
  point values ignored the fixed severity weights. The tests were corrected;
  the engine was not changed.

## Phase 6 - Frontend delivery

### M1 - Application scaffold and shell

| Step | Scope | Status |
|---|---|---|
| M1.1 | Vite + React + TypeScript + Tailwind v4 scaffold under `frontend/` | Done |
| M1.2 | Environment configuration and `/api` development proxy | Done |
| M1.3 | Responsive app shell, navigation and URL-synced `as_of` control | Done |
| M1.4 | Shared read-only UI primitives | Done |
| M1.5 | Typed API client, query hook and label/format helpers | Done |
| M1.6 | Route placeholders for M2-M6 with no invented data | Done |
| M1.7 | Build, browser validation and documentation | Done |

The frontend is a separate Vite application. It consumes the M0 list endpoints
and the existing risk and anomaly APIs; it does not duplicate scoring, overdue
evaluation or anomaly detection.

Files:

- `frontend/vite.config.ts` - React and Tailwind plugins, port 5173, and a
  `/api` proxy to `http://127.0.0.1:8000` controlled by `API_PROXY_TARGET`.
- `frontend/src/api/client.ts` - native `fetch` wrapper with typed `ApiError`,
  query serialization, abort support and FastAPI error extraction.
- `frontend/src/api/types.ts` - enums, health response and the
  `{ as_of, total, items }` list envelope.
- `frontend/src/hooks/useAsOf.tsx` - `as_of` context synchronized with the URL.
- `frontend/src/hooks/useApiQuery.ts` - loading, error, abort and refetch state.
- `frontend/src/components/layout/` - `AppShell`, `Sidebar`, `Topbar`,
  `AsOfControl` and `PageHeader`. `PlaceholderPage` was removed in M6 when the
  last placeholder route became a real page.
- `frontend/src/components/ui/` - badge, button, card, input, select, data
  table, drawer, icons and loading/empty/error states.
- `frontend/src/pages/` - Dashboard, Audits, Risk findings, Anomalies, Action
  plans and NotFound.
- `frontend/src/lib/` - class joining, controlled-vocabulary labels, UTC-safe
  date formatting and severity tone mappings.

Design decisions:

- A Vite proxy is used instead of enabling backend CORS. The browser only calls
  `/api`, and `API_PROXY_TARGET` is server-side configuration.
- `as_of` lives in the URL, so a view can be shared or reloaded. Navigation
  links preserve it; when it equals the default it is omitted. Invalid values
  render the default and are removed from the URL with a replace navigation.
- Placeholder pages deliberately show no metrics. Every number in the product
  must come from the API, so M1 shows an explicit "not connected yet" state.
- `as_of` validation compares parsed UTC parts back to the input, because
  `new Date("2026-02-31")` silently rolls into March.
- The drawer traps focus, closes on Escape and restores the previously focused
  element. Tables expose a caption and scoped headers; the shell has a skip
  link and visible focus styles.
- Motion is reduced under `prefers-reduced-motion`.

Validation:

- `npm run build`: TypeScript clean; production bundle 275.91 kB JS
  (87.65 kB gzip) and 26.79 kB CSS (6.03 kB gzip).
- Browser run at a 816x752 viewport against the development backend:
  `/api/health` returned 200 through the proxy and the topbar showed
  "API connected".
- Mobile navigation opened, closed on selection and on Escape; routes and active
  navigation state were correct.
- Changing `as_of` to `2026-06-30` updated the URL, persisted across navigation
  and revealed Reset; Reset returned to `2026-10-31` and removed the parameter.
- `?as_of=2026-02-31` displayed `2026-10-31` and cleaned the URL.
- An unknown path rendered the not-found page. No console errors were recorded.

### M2 - Dashboard

| Step | Scope | Status |
|---|---|---|
| M2.1 | Shared response types and read-only fetchers for risk, audits, findings, actions and anomalies | Done |
| M2.2 | Presentation-only aggregation helpers and Vitest coverage | Done - 13 tests |
| M2.3 | Dashboard panels, KPI strip, partial-data and all-failed states | Done |
| M2.4 | Responsive, accessibility, failure-mode and browser validation | Done |

The Dashboard issues five requests in parallel and lets each section settle
independently.

| Source | Displayed content |
|---|---|
| `GET /risk/summary` | Portfolio score/band, rule contribution table, department ranking, unresolved severity counts |
| `GET /findings` | Status mix, latest identified findings, priority high/critical findings |
| `GET /audits` | Status coverage, audits with open findings, audits with overdue actions |
| `GET /actions` | Status mix, completed/blocked/overdue totals, most-overdue actions |
| `GET /anomalies/audits` | Top anomaly scores, percentile, first deviation and the API disclaimer |

Files added or changed:

- `frontend/src/api/types.ts` - risk, audit, finding, action and anomaly response
  contracts mirrored from the backend schemas.
- `frontend/src/api/risk.ts`, `audits.ts`, `findings.ts`, `actions.ts`,
  `anomalies.ts` - typed read-only fetchers.
- `frontend/src/pages/dashboard/dashboardData.ts` - status counts, priority and
  latest selection, action summary, overdue ordering and anomaly ranking.
- `frontend/src/pages/dashboard/dashboardData.test.ts` - 13 Vitest tests.
- `frontend/src/pages/dashboard/DashboardPage.tsx` - five queries, KPI strip,
  partial-data banner, whole-page retry and responsive grid.
- `frontend/src/pages/dashboard/components/` - eight panels plus
  `DashboardSection`, `KpiStrip` and `PanelLink`.
- `frontend/src/components/ui/DistributionBar.tsx` - accessible stacked status
  bar with a visible text legend.
- `frontend/src/lib/links.ts` - shared `as_of`-preserving link builder.
- `frontend/src/lib/chartColors.ts`, `statusTones.ts`, `format.ts`,
  `labels.ts` - chart colours, status tones, decimal formatting and anomaly
  feature/direction labels.
- `frontend/src/hooks/useApiQuery.ts` - clears stale data when a new request
  starts, so a changed `as_of` cannot leave old values on screen.
- `frontend/src/components/layout/Sidebar.tsx` - uses the shared link builder.
- `frontend/package.json` - adds Vitest 5.1.0 and the `test` script.

Mapping decisions:

- Unresolved severity counts come from `/risk/summary.open_findings`, not from
  counting `/findings` rows.
- Findings status counts and the latest list come from `/findings.items`, which
  is already ordered newest-first by the API.
- Priority findings are unresolved high/critical rows ordered by direct
  `risk_score`, then severity, identification date and ref. The
  portfolio-calibrated `risk_band` is deliberately not used as the sort label.
- Actions use API `is_overdue` and `days_overdue`; the browser never recomputes
  overdue state.
- Anomalies are described as unusual and advisory. The panel repeats the API
  disclaimer and states that an unusual audit is not necessarily risky or
  fraudulent.

Validation:

- `npm test`: 13 passed. The first run had two incorrect test expectations
  (a severity tie-break order and an overdue action's independent `not_started`
  status); the tests were corrected and the helpers were not changed.
- `npm run typecheck`: clean.
- `npm run build`: clean; 663.62 kB JS (198.48 kB gzip) and 30.19 kB CSS
  (6.59 kB gzip). Vite warns that the Recharts-inclusive chunk exceeds 500 kB;
  this is a bundle-size warning, not a build failure.
- Default `2026-10-31`: portfolio 1,450 critical / 123 hits; 70 unresolved
  (13 critical); 60 audits; 197 findings; 165 actions with 37 overdue; 56
  anomaly-eligible audits with 6 flags; top flag `AUD-2025-0005` (0.601,
  percentile 100.0).
- `2026-06-30`: portfolio 612 critical / 64 hits; 49 audits; 144 findings; 123
  actions with 20 overdue; 42 anomaly-eligible audits with 5 flags.
- `2023-01-01`: risk still shows 93 / 11 hits from active controls (R6), while
  audits, findings, actions and anomaly-eligible audits are all empty. The page
  renders a genuine mixed empty/partial state rather than a fake full page.
- Partial failure: a temporary proxy returned 500 for `/findings` only. The
  other panels loaded, the KPI tile showed "Data unavailable", both finding
  panels showed their own errors, and "Retry failed panels" issued only a new
  findings request.
- Whole-page failure: a proxy pointed at a dead port produced the all-failed
  "Unable to load the dashboard" state. "Try again" issued a new request.
- Responsive iframe checks at 390, 816 and 1440 px: no horizontal overflow.
  390 px used the mobile navigation, a two-column KPI strip and a single-column
  panel grid; 816 px used three KPI columns and a single panel column; 1440 px
  showed the desktop sidebar, five KPI columns and the intended three-column
  panel grid.
- Navigation: "View anomalies" produced `/anomalies?as_of=2026-06-30` and the
  target page retained the date.
- Lighthouse after three contrast fixes: Accessibility 1.0, Best Practices 1.0,
  SEO 0.8. The SEO result is only the development server's missing
  `robots.txt`; no application page audit failed.
- No application console errors occurred during normal runs. The only console
  errors were the intentional simulated 500 and dead-proxy requests.

### M3 - Audit register

| Step | Scope | Status |
|---|---|---|
| M3.1 | API-backed audit filters and typed fetcher options | Done |
| M3.2 | Searchable register with department, type and status filters | Done |
| M3.3 | Client-side sortable columns over the returned rows | Done - 9 tests |
| M3.4 | Accessible audit detail drawer and related-register links | Done |
| M3.5 | Empty, error, partial-data and responsive validation | Done |

The register issues one `GET /audits` request per filter or evaluation-date
change. Filtering stays on the API; sorting is presentation-only over the
returned rows.

Mapping decisions:

- Department, audit type and status map directly to the API's `department`,
  `audit_type` and `status` query parameters.
- Search is debounced by 300 ms and sent as `search`, which the API matches
  against audit reference, title and lead auditor.
- The default sort is start date descending, matching the API's ordering.
  Text columns open ascending; count and date columns open descending.
- Missing end dates render as an em dash and sort last in both directions.
- The summary strip adds the finding, open-finding, action and overdue-action
  counts the API returned per visible audit. Overdue state is never recomputed
  in the browser.
- The detail drawer uses only fields already present on the audit row. Related
  links open `/findings` and `/actions` with `audit_ref` and preserve `as_of`.
- If the API reports a larger total than the number of returned rows, a
  partial-data banner states that the table and totals cover the returned rows.

Files added or changed:

- `frontend/src/api/audits.ts` - optional `AuditListFilters` and query mapping.
- `frontend/src/components/ui/DataTable.tsx` - optional sortable headers with
  `aria-sort` and keyboard-operable sort buttons.
- `frontend/src/pages/audits/auditRegister.ts` - sort comparators, natural sort
  direction, register totals and the default sort.
- `frontend/src/pages/audits/auditRegister.test.ts` - 9 Vitest tests.
- `frontend/src/pages/audits/AuditsPage.tsx` - filter state, debounced search,
  sorting, table, empty/error/partial states and the detail drawer.
- `frontend/src/pages/audits/components/AuditDetailPanel.tsx` - engagement
  metadata, counts and linked registers.
- `frontend/src/pages/audits/components/AuditRegisterSummaryStrip.tsx` -
  matching-audit and related-count totals.

Validation:

- `npm test`: 22 passed (13 dashboard, 9 register); `npm run typecheck`: clean.
- `npm run build`: clean; 681.75 kB JS (202.50 kB gzip) and 32.33 kB CSS
  (6.87 kB gzip). The Recharts chunk-size warning remains non-blocking.
- Default `2026-10-31`: 60 matching audits, 197 findings, 70 open findings and
  37 overdue actions. Department `finance` narrowed this to 10 audits / 32
  findings / 10 open / 7 overdue; adding type `financial` and status `completed`
  narrowed it to 8 audits / 25 findings / 6 open / 6 overdue.
- Search `payroll` returned the filtered empty state; `AUD-2026-0009` returned
  exactly one row. Clearing filters restored all 60 rows.
- Findings sorted descending and ascending correctly; the end-date column kept
  null completion dates last in both directions.
- The detail drawer showed the selected engagement's API counts. Its links were
  `/findings?audit_ref=AUD-2026-0009` and `/actions?audit_ref=AUD-2026-0009` at
  the default date, and added `&as_of=2026-06-30` after changing the date.
- Escape closed the drawer, restored body scrolling and returned focus to the
  originating row. Enter on a focused row opened the drawer.
- `2026-06-30`: 49 matching audits and 20 overdue actions. `2023-01-01`: no
  audits, with the date-specific empty state rather than the filtered one.
- A simulated transport failure rendered the register error state with retry;
  restoring the network and pressing "Try again" loaded 49 rows. A simulated
  partial response rendered the partial-data banner.
- Headless browser checks at 390, 816 and 1440 px found no page-level horizontal
  overflow. Filter and summary grids used 1, 2 and 4 columns respectively; the
  wide table scrolled inside its card; at 390 px the drawer occupied the full
  viewport. No console errors occurred.
- The first Lighthouse run reported a contrast failure on the critical summary
  tile and invalid `<dl>` group contents. Both were corrected. Final scores:
  Accessibility 1.0, Best Practices 1.0, SEO 0.8 (development `robots.txt`
  only).

### M4 - Risk finding register

| Step | Scope | Status |
|---|---|---|
| M4.1 | API-backed finding filters, `audit_ref` support and scoped risk fetchers | Done |
| M4.2 | Searchable, filterable and sortable finding register | Done |
| M4.3 | Direct rule attribution with reasons, alert severity and typed evidence | Done |
| M4.4 | Separate R4 recurrence and R6 weak-control department context | Done - 20 tests |
| M4.5 | Empty, error, partial-data, accessibility and responsive validation | Done |

The register issues one `GET /findings` request per filter, search or
evaluation-date change. The detail drawer adds two independent requests:
`GET /risk/findings/{finding_ref}` for direct hits and scoped R4 clusters, and
`GET /risk/departments/{department}` for R6 control context.

Mapping decisions:

- Severity, status and department map directly to the API's `severity`,
  `status` and `department` parameters. Search is debounced by 300 ms and sent
  as `search`.
- `audit_ref` is read from the URL and sent to the API. This makes the M3 audit
  drawer's finding link open the matching subset, and clearing the audit badge
  removes only that parameter so `as_of` survives.
- Sorting is presentation-only over the returned rows. The default is
  identified date descending, matching the API's newest-first order.
- The register row's `risk_score`, `risk_band` and `rule_ids` are API values.
  The detail response supplies the reasons and evidence and is preferred for
  the displayed score, with the row value used only while it loads or if it
  fails.
- Direct hits are R1, R2, R3 and R5 applications whose `finding_ref` is this
  finding. R4 `related_department_hits` are shown under "R4 recurrence
  context"; R6 hits are selected from the department response and shown under
  "R6 weak-control context". Neither group is added to the direct score or used
  to change its band.
- Every rule card labels the hit's severity as "Alert severity". The register
  column and the panel's finding badge say "Finding severity", because the two
  are different attributes.
- Typed evidence is labelled and formatted by key: dates are UTC-safe, day and
  point values carry units, controlled vocabulary is translated, arrays are
  joined and nulls render as "Not recorded".
- If the API reports a larger total than the number of returned rows, the
  partial-data banner states that the register and its totals cover the
  returned rows. Detail requests keep separate loading and error states, so a
  finding-risk failure does not hide R6 context, and each can retry alone.

Files added or changed:

- `frontend/src/api/findings.ts` - finding filters, `audit_ref`/`rule_id`
  mapping and the `/risk/findings/{finding_ref}` fetcher.
- `frontend/src/api/risk.ts` - `/risk/departments/{department}` fetcher.
- `frontend/src/api/types.ts` - `FindingRisk`, `DepartmentRiskDetail` and rule
  hit contracts.
- `frontend/src/pages/findings/FindingsPage.tsx` - filter state, debounced
  search, URL `audit_ref`, sorting, summary strip, states and the drawer.
- `frontend/src/pages/findings/findingRegister.ts` - sort comparators, natural
  sort direction and register totals.
- `frontend/src/pages/findings/components/FindingDetailPanel.tsx` - direct
  attribution, R4/R6 separation, per-section errors and related links.
- `frontend/src/pages/findings/components/FindingsSummaryStrip.tsx` -
  matching, high/critical, unresolved and direct-point totals.
- `frontend/src/pages/findings/findingRegister.test.ts` - 10 Vitest tests.

M5 moved the shared evidence and rule-card code out of the finding page so the
action register could reuse it without duplicating logic:

- `frontend/src/lib/ruleEvidence.ts` - evidence labels, value formatting and
  rule-hit selection (formerly `pages/findings/findingDetail.ts`).
- `frontend/src/components/risk/RuleHitCard.tsx` - rule reason, points, alert
  severity and typed evidence (formerly `pages/findings/components/`).
- `frontend/src/lib/ruleEvidence.test.ts` - the same 10 evidence tests, moved
  with the helper.
- `frontend/src/lib/labels.ts` - rule entity, control effectiveness and control
  category labels.

Validation:

- `npm test`: 42 passed across 4 files (13 dashboard, 9 audit register, 10
  finding register, 10 finding detail). `npm run typecheck`: clean.
- `npm run build`: clean; 705.44 kB JS (207.91 kB gzip) and 32.96 kB CSS
  (6.99 kB gzip). The Recharts chunk-size warning remains non-blocking.
- Default `2026-10-31`: 197 matching findings. Severity `critical` returned 30;
  adding status `open` and department `it` returned 2. Search `handover`
  returned 1 row; clearing filters restored 197.
- `?audit_ref=AUD-2026-0021` returned 6 rows, all from that audit, and showed an
  audit-filter badge. Adding `as_of=2026-06-30` produced the filtered empty
  state; clearing the audit filter kept the date and returned 144 findings.
- `2023-01-01`: date-specific "No findings at this date" state with zero summary
  totals.
- A simulated transport failure rendered the register error state with retry;
  restoring the network and pressing "Try again" recovered. A simulated partial
  response rendered "API reports 35 matching findings but returned 30 rows."
- Detail for `FND-2026-0087`: direct score 30 with one R2 hit (30 pts, critical
  alert severity); related R4 5 pts (high); three R6 hits at 15, 6 and 6 pts
  (medium). All typed evidence rendered with labels and units, and the direct
  score remained 30.
- A simulated finding-risk failure showed errors for direct attribution and R4
  recurrence while R6 context still loaded; retry recovered both sections.
  Escape closed the drawer and restored body scrolling.
- Headless browser checks at 390, 816 and 1440 px found no page-level horizontal
  overflow. Filter and summary grids used 1, 2 and 4 columns; the wide table
  scrolled inside its card; at 390 px the drawer occupied the full viewport.
- Lighthouse on the register and again with the detail drawer open:
  Accessibility 1.0, Best Practices 1.0, SEO 0.8. The only failure was the
  development server's missing `robots.txt`. The single 404 in the request log
  was the browser's automatic `/favicon.ico` request; `index.html` declares no
  favicon. No application console errors occurred outside the intentional
  failure simulations.

### M5 - Action-plan register

| Step | Scope | Status |
|---|---|---|
| M5.1 | API-backed status, department, overdue, audit and finding filters | Done |
| M5.2 | Searchable, filterable and sortable action register | Done |
| M5.3 | Overdue state, owner/dates and finding context in the detail panel | Done |
| M5.4 | Shared rule-hit card; R1/R5 attribution with reasons and typed evidence | Done - 10 tests |
| M5.5 | Empty, error, partial-data, accessibility and responsive validation | Done |

The register issues one `GET /actions` request per filter, search or
evaluation-date change. The row already contains the complete R1/R5 hits, the
API's overdue state and days overdue, so the detail panel needs no extra
request.

Mapping decisions:

- Status, department and overdue map directly to the API's `status`,
  `department` and `overdue` parameters. Search is debounced by 300 ms and sent
  as `search`.
- `audit_ref` and `finding_ref` are read from the URL and sent to the API. This
  makes the M3 audit drawer and the M4 finding drawer links open the matching
  subset. Clearing filters removes only those two parameters, so `as_of`
  survives.
- Sorting is presentation-only over the returned rows. The default is due date
  ascending, matching the API order. Status sorts blocked, not started, in
  progress, then completed; missing completion dates sort last in both
  directions; days-overdue and rule-point columns open descending.
- Overdue state, days overdue and R1/R5 points are API values. The browser
  never re-implements the due-date comparison or recalculates points.
- R1 and R5 points are attributed to the action plan and also contribute to the
  parent finding's direct score. The detail panel states this rather than
  presenting the action points as a separate score.
- The detail panel shows action status, overdue badge, owner, due and completion
  dates, finding/audit context, four attribution tiles and every R1/R5 hit. An
  action with no hits shows an explicit zero-hit empty state.
- Rule evidence and its card were moved to `lib/ruleEvidence.ts` and
  `components/risk/RuleHitCard.tsx` so findings and actions share one
  implementation.
- If the API reports a larger total than the number of returned rows, the
  partial-data banner states that the register and its totals cover the
  returned rows.

Files added or changed:

- `frontend/src/api/actions.ts` - action filters and query mapping.
- `frontend/src/pages/actions/ActionPlansPage.tsx` - filter state, debounced
  search, URL `audit_ref`/`finding_ref`, sorting, summary strip, states and the
  drawer.
- `frontend/src/pages/actions/actionRegister.ts` - sort comparators, natural
  sort direction, null completion handling and register totals.
- `frontend/src/pages/actions/components/ActionDetailPanel.tsx` - action
  metadata, API overdue context, R1/R5 cards, zero-hit state and related links.
- `frontend/src/pages/actions/components/ActionsSummaryStrip.tsx` - matching,
  overdue, blocked and action-rule-point totals.
- `frontend/src/pages/actions/actionRegister.test.ts` - 10 Vitest tests.
- `frontend/src/lib/ruleEvidence.ts` and
  `frontend/src/components/risk/RuleHitCard.tsx` - shared evidence formatting
  and rule card.
- `frontend/src/pages/findings/components/FindingDetailPanel.tsx` - imports the
  shared modules and links to `/actions?finding_ref=...`.

Validation:

- `npm test`: 52 passed across 5 files (13 dashboard, 9 audit register, 10
  finding register, 10 rule evidence, 10 action register). `npm run typecheck`:
  clean.
- `npm run build`: clean; 723.29 kB JS (210.73 kB gzip) and 33.15 kB CSS
  (7.03 kB gzip). The Recharts chunk-size warning remains non-blocking.
- Default `2026-10-31`: 165 matching actions, 37 overdue, 8 blocked and 529
  action rule points. Status `blocked` returned 8 rows, all overdue, 142 points.
  Department `it` returned 36 rows, 11 overdue, 5 blocked, 190 points. Overdue
  `true` returned 37 rows and 529 points; `false` returned 128 rows with zero
  overdue, blocked and rule points. Search `Bianchi` returned 14 rows, all owned
  by that owner. Clearing filters restored 165.
- `?as_of=2026-06-30&audit_ref=AUD-2025-0005` returned 4 rows and showed the
  audit badge. Clearing filters kept the date and returned 123 actions. An
  invalid `as_of=2026-02-31` fell back to `2026-10-31` and was removed from the
  URL while `audit_ref` survived.
- The M4 finding drawer for `FND-2026-0087` now links to
  `/actions?finding_ref=FND-2026-0087`; the destination showed 2 rows, all for
  that finding, and a finding-filter badge.
- Detail for action #177: blocked, 626 days overdue, one R1 hit and one R5 hit,
  7 points. Ownership, finding/audit context, both reasons and all typed
  evidence rendered. Action #312 showed the zero-hit state with "Not overdue".
- Sorting worked in both directions with correct `aria-sort`: due date
  descending, rule points descending and status ascending with blocked first.
- `2023-01-01`: date-specific "No actions at this date" state with zero summary
  totals.
- A simulated transport failure rendered the register error state; "Try again"
  recovered 8 filtered rows. A simulated partial response showed "API reports 37
  matching action plans but returned 10 rows" and totals over the returned rows.
- Dispatching Escape closed the drawer, restored body scrolling and returned
  focus to the originating "View details" button. The focus trap wrapped between
  the first and last focusable elements.
- Headless browser checks at 390, 816 and 1440 px found no page-level horizontal
  overflow. Filter and summary grids used 1, 2 and 4 columns; the wide table
  scrolled inside its card; at 390 px the drawer occupied the full viewport and
  rendered both rule cards.
- Lighthouse on the register and again with the detail drawer open:
  Accessibility 1.0, Best Practices 1.0, SEO 0.8. The only failure was the
  development server's missing `robots.txt`. The headless log's single 404 was
  the browser's automatic `/favicon.ico` request, matching M4.

### M6 - Anomaly register

| Step | Scope | Status |
|---|---|---|
| M6.1 | Ranked anomaly register with score, percentile, flag and API rank | Done |
| M6.2 | Department and flag-status filters, sorting and summary strip | Done - 12 tests |
| M6.3 | Detail panel with 11 deviations, disclaimer, rule context and detector metadata | Done |
| M6.4 | Feature units and robust z formatting | Done - 8 tests |
| M6.5 | Empty, error, partial-data, accessibility and responsive validation | Done |

The register issues one `GET /anomalies/audits` request per evaluation-date
change. The row already carries the score, percentile, advisory flag, the three
largest deviations and the joined rule points, so sorting and filtering stay in
the browser. Opening a row adds one `GET /anomalies/audits/{audit_ref}` request
for all 11 deviations.

Mapping decisions:

- The anomaly endpoint accepts only `as_of`, so department and flag-status
  filters are applied to the returned rows. No backend filter was added. The
  status line always states how many of the API's eligible audits are shown.
- The default sort is score descending, matching the API's ranked order. Natural
  directions are score, percentile, flag and rule points descending; audit and
  department ascending. Later clicks toggle.
- The rank column is the position in the original API list. It is captured
  before sorting or filtering, so `#56` stays `#56` for `AUD-2026-0018` after the
  table is re-sorted by rule points.
- Scores, percentiles, flags and deviations are never recalculated.
  `lib/anomalyFeatures.ts` chooses a unit and precision only: shares and rates as
  percentages, day features with a unit, counts as whole numbers and robust
  z-scores with an explicit sign and two decimals.
- The list shows one "largest deviation" cell; the drawer shows all 11 ordered
  by absolute robust z-score. Bars are capped at a robust z-score of 5 for
  layout while the printed value remains unclipped.
- Rule points and rule IDs are labelled context. They are joined after scoring
  and are never model inputs.
- The detail panel shows the API's own disclaimer, the detector configuration
  from the list response and links to `/findings?audit_ref=...` and
  `/actions?audit_ref=...` that keep `as_of`.
- If the API reports a larger total than the returned rows, the partial-data
  banner states that the register and its totals cover the returned rows.

Files added or changed:

- `frontend/src/api/anomalies.ts` - list fetcher plus the per-audit detail fetcher.
- `frontend/src/api/types.ts` - `AuditAnomalyDetail` alongside the existing
  anomaly contracts.
- `frontend/src/lib/anomalyFeatures.ts` - feature units and signed robust z
  formatting.
- `frontend/src/pages/anomalies/AnomaliesPage.tsx` - filters, sorting, summary
  strip, states and the drawer.
- `frontend/src/pages/anomalies/anomalyRegister.ts` - filtering, sort
  comparators, natural directions and presentation totals.
- `frontend/src/pages/anomalies/components/AnomalyDetailPanel.tsx` - metrics,
  disclaimer, deviations, rule context, detector metadata and related links.
- `frontend/src/pages/anomalies/components/AnomalySummaryStrip.tsx` - matching,
  flag, highest-score and rule-point tiles.
- `frontend/src/pages/anomalies/anomalyRegister.test.ts` and
  `frontend/src/lib/anomalyFeatures.test.ts` - 20 Vitest tests.

Validation:

- `npm test`: 72 passed across 7 files (13 dashboard, 9 audit register, 10
  finding register, 10 rule evidence, 10 action register, 12 anomaly register, 8
  anomaly features). `npm run typecheck`: clean.
- `npm run build`: clean; 741.31 kB JS (213.74 kB gzip) and 33.36 kB CSS
  (7.07 kB gzip). The Recharts chunk-size warning remains non-blocking.
- Default `2026-10-31`: 56 rows, 6 flags, highest score 0.601 and 1,227 joined
  rule points, with score descending and `aria-sort="descending"`.
- Department filters returned IT 8 rows/2 flags, Finance 10/2, Procurement
  11/2, Operations 12/0, Compliance 8/0 and Human Resources 7/0. Flagged-only
  returned 6 rows, all flagged; not-flagged returned 50. IT plus flagged-only
  returned 2; Operations plus flagged-only produced the filtered-empty state
  with its own "Clear filters" action.
- Sorting worked in both directions with correct `aria-sort` for score, audit,
  department, flag, percentile and rule points. Each row's displayed rank still
  matched its position in the original API list.
- `AUD-2025-0005` drawer: score 0.601, percentile 100.0%, API rank #1, 0 rule
  points, no rule IDs, all 11 deviations ordered by absolute robust z-score
  (+3.73, +2.85, -2.56, ...) and the full detector configuration.
  `AUD-2026-0018`: 88 rule points with R1/R2/R3/R5 badges labelled as context.
- Detail links from `?as_of=2026-06-30` carried `&as_of=2026-06-30` into the
  findings and action registers. The June date itself returned 42 eligible
  audits with 5 flags.
- A simulated transport failure rendered the register error state with `—`
  summary tiles; "Try again" restored the rows. A simulated detail failure left
  the list-derived metrics, detector metadata and links visible with their own
  retry, which then loaded all 11 deviations.
- A simulated partial response showed "The API reports 42 eligible audits but
  returned 3 rows" and totals over the returned rows. `?as_of=2023-01-01`
  showed the date-specific empty state with zero matching audits.
- Dispatching Escape closed the drawer, restored body scrolling and returned
  focus to the originating "View anomaly details" button.
- Headless browser checks at 390, 816 and 1440 px found no page-level horizontal
  overflow. Filter and summary grids used 1, 2 and 4 columns; the wide register
  scrolled inside its card; the drawer was full-width at 390 px and 576 px above
  that, and rendered all 11 deviations at every width.
- Lighthouse on the register and again with the detail drawer open:
  Accessibility 1.0, Best Practices 1.0, SEO 0.8. The only failure was the
  development server's missing `robots.txt`. The headless log's single 404 was
  the browser's automatic `/favicon.ico` request, matching M4 and M5.

The frontend is now feature-complete against the read-only contract. There is no
authentication, pagination or write path, matching the read-only scope.

### M7 - Integration and demo readiness

M7 completes the register integration without changing backend code, API
contracts, risk rules, anomaly logic or database models.

- Audits, findings and action plans share `useUrlSearchParams`, which merges
  rapid sequential filter changes from an accumulated URL snapshot instead of
  React Router's stale functional-update value.
- Added regression tests for consecutive filter updates, `as_of` and unrelated
  query preservation, and resynchronization after committed navigation/history.
- Kept URL enum validation in each register; unknown values render as
  unfiltered and are omitted from API requests.
- Updated the README and demo checklist to include the URL-update race,
  regression coverage and current test count.

Validation:

- `npm test`: 86 passed across 10 files.
- `npm run typecheck`: clean.
- `npm run build`: succeeded; 743.86 kB JavaScript (214.71 kB gzip) and
  33.60 kB CSS (7.12 kB gzip). Vite's existing >500 kB chunk warning remains
  non-blocking.
- Production preview on `http://127.0.0.1:4173`: direct navigation to `/audits`,
  `/findings` and `/actions`, including filtered deep routes, loaded correctly.
  Health and list requests returned 200 through the `/api` proxy; no console
  errors were recorded.
- Browser verification: rapid department/status, severity/department and
  status/department changes retained both selections on Audits, Findings and
  Actions. Reload restored them; Back and Forward restored the corresponding
  audit filter states. A copied filtered Findings URL opened in a separate tab
  with the same selections and date. Clearing action filters kept `as_of` and
  an unrelated `campaign` parameter.
- Hand-edited enum values were ignored in all three registers and were not
  sent to the API. An invalid calendar date fell back to `2026-10-31` and was
  removed from the URL.
- Historical chain at `as_of=2026-06-30`: 49 audits; `AUD-2025-0005` opened
  four findings; `FND-2025-0020` showed direct score 0 and its department-level
  R4 context; its action link opened action #195 as the single result. The
  action detail showed owner J. Silva, API-computed not-overdue state, zero
  rule hits and no action-level hits.

## Known limitations

- `findings.identified_date >= audits.start_date` is cross-table, so it is
  enforced in the validation layer and tests rather than by a DB CHECK.
- `updated_at` is refreshed on ORM updates only; bulk SQL updates must set it
  explicitly.
- Deleting or renaming a ref in the generator does not remove the old row on a
  plain `--load`; use `--reset-synthetic` after changing the dataset shape.
