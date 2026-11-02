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

## Known limitations

- `findings.identified_date >= audits.start_date` is cross-table, so it is
  enforced in the validation layer and tests rather than by a DB CHECK.
- `updated_at` is refreshed on ORM updates only; bulk SQL updates must set it
  explicitly.
- Deleting or renaming a ref in the generator does not remove the old row on a
  plain `--load`; use `--reset-synthetic` after changing the dataset shape.
