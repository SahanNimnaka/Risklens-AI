# RiskLens AI - Demo Guide

A repeatable, read-only walkthrough against the synthetic dataset. Every number
in this guide comes from the API at the stated `as_of` date. Do not present the
scores as accuracy, precision, recall or a real-world benchmark.

## Before the demo

1. Start PostgreSQL and confirm the database is loaded.
2. Start the backend from the repository root:

   ```powershell
   $env:PYTHONPATH="backend"
   .\.venv\Scripts\uvicorn.exe app.main:app --reload
   ```

3. Start the frontend from `frontend/`:

   ```powershell
   npm run dev
   ```

4. Open `http://127.0.0.1:5173` and confirm the topbar shows the API as healthy.

If the demo is run from a production build, use `npm run build` then
`npm run preview` on `http://127.0.0.1:4173`. Both servers proxy `/api` to the
backend; the browser never calls port 8000 directly.

## Baseline facts

Default date `as_of=2026-10-31`:

| Measure | Value |
|---|---|
| Portfolio risk | 1,450 / Critical |
| Rule hits | 123 |
| Unresolved findings | 70 (13 critical) |
| Audits | 60 |
| Findings | 197 (93 high or critical) |
| Action plans | 165 |
| Overdue actions | 37 |
| Blocked actions | 8 |
| Action rule points | 529 |
| Finding direct rule points | 1,227 |
| Anomaly-eligible audits | 56 |
| Advisory flags | 6 |
| Top anomaly | `AUD-2025-0005`, score 0.601 |

Historical date `as_of=2026-06-30`:

| Measure | Value |
|---|---|
| Portfolio risk | 612 / Critical |
| Rule hits | 64 |
| Unresolved findings | 36 |
| Audits | 49 |
| Findings | 144 |
| Action plans | 123 |
| Anomaly-eligible audits | 42 |
| Advisory flags | 5 |

## Demo script

### 1. Frame the product

RiskLens AI is a read-only audit-risk view over synthetic data. Six fixed rules
produce the deterministic score. The anomaly view ranks audits by how unusual
they look relative to department peers; it is advisory and never changes the
score. Every displayed value is API-provided.

### 2. Dashboard

Open `/`.

- Portfolio risk **1,450**, **Critical**, **123** rule hits, **70** unresolved.
- **60** audits, **197** findings, **37** overdue actions.
- Point out the rule contribution table and the department ranking.
- Open **Anomaly watch** and note **6 of 56** eligible audits flagged.

### 3. Anomaly register

Follow **View anomalies** (or open `/anomalies`).

- The default sort is score descending; the top row is
  `AUD-2025-0005` at **0.601** and percentile **100.0%**.
- Open the drawer. It shows all 11 peer-relative deviations, the detector
  metadata and the API disclaimer.
- Say explicitly: "unusual" is not "risky" and is not confirmed fraud or
  misconduct. Rule points in this view are context only.

### 4. Audit register

Follow **View audits** (or open `/audits`).

- **60** audits, **197** findings raised, **70** open findings, **37** overdue
  actions.
- Filter to **IT** to show API-side filtering.
- Open `AUD-2025-0005` and show the engagement details plus the links to its
  findings and action plans.

### 5. Switch the evaluation date

Use the **As of** control and choose `2026-06-30`.

- Portfolio risk becomes **612 / Critical / 64 hits / 36 unresolved**.
- The registers become **49** audits, **144** findings and **123** actions.
- Anomalies become **42** eligible with **5** flags.
- Confirm the URL contains `as_of=2026-06-30`, and that every sidebar link keeps
  the date.

### 6. Follow one finding to its remediation

1. Open `/audits?as_of=2026-06-30`.
2. Open `AUD-2025-0005`.
3. Choose **View findings (4)**. The findings register opens with
   `audit_ref=AUD-2025-0005` and **4** rows.
4. Open `FND-2025-0020`.
5. Show **direct score 0**, **direct hits 0**, and the R4 recurrence section.
   Explain that R4 belongs to the department, so it is context and is not added
   to the finding's direct score.
6. Choose **View action plans for this finding**. One action plan is shown.
7. Open action **#195**. Show the owner, dates, API-computed overdue state and
   the explicit "no action-level rule hits" state.
8. Use the drawer's audit links to return to the same filtered views; confirm
   `as_of=2026-06-30` is still present.

### 7. Show URL-backed filters

On any register:

- Change a select filter (for example finding severity = **High**).
- Change a second select filter immediately; both values remain in the URL.
- Reload the page; the filter survives.
- Press browser Back and Forward; the register follows the URL.
- Copy the URL into a new tab; it opens the same filtered view with the same
  date.
- Choose **Clear filters**; only the filter parameters are removed. `as_of`
  remains.
- Try an unknown enum value in the URL; it is ignored and is not sent to the
  API.

### 8. Optional: edge cases and recovery

- **Invalid date:** open `/audits?as_of=2026-02-31`. The app falls back to
  `2026-10-31` and removes the malformed parameter.
- **Unknown reference:** open
  `/findings?audit_ref=AUD-NOT-REAL`. The register shows the filtered-empty
  state with **Clear filters**, not an error.
- **Unknown route:** open `/does-not-exist`. The not-found page is shown.
- **Empty date:** open `/?as_of=2023-01-01`. Risk still shows **93 / Medium / 11
  hits**, while audits, findings, actions and anomalies are empty. Explain that
  control-based scoring (R6) is not gated by audit start dates; this is existing
  backend behaviour, not a frontend bug.
- **Resilience:** stop the backend, change the date, and show the dashboard
  partial-failure banner and **Retry failed panels**. Restart the backend and
  retry. Do not change any data.

## Caveats to state

- Synthetic data only; there are no ground-truth risk or anomaly labels.
- `as_of` changes which findings are visible and how overdue is evaluated.
  Status and effectiveness columns are current-state values, not history.
- Anomaly flags are peer-relative and advisory. "Unusual" is not "bad".
- The app is local and read-only. It has no authentication, pagination, write
  path, rate limiting or production hosting configuration.
- The frontend depends on the same-origin `/api` proxy. A static build pointed
  directly at the backend will not work because CORS is not configured.

## Validation checklist

```powershell
# repository root
.\.venv\Scripts\python.exe -m pytest -q        # 139 passed, 1 warning

# frontend/
npm test                                       # 86 passed across 10 files
npm run typecheck                              # clean
npm run build                                  # succeeds; chunk-size warning remains
```

Manual checks:

- All five pages load at `2026-10-31` with the baseline values above.
- `2026-06-30` propagates to every page and drawer link.
- The audit → findings → action chain works at `2026-06-30`.
- Reloading a filtered register restores the filters and `as_of`.
- Two rapid filter changes retain both values; Back and Forward restore the
  corresponding URL-backed state.
- Invalid date, unknown reference and unknown route show the expected states.
- Stopping the backend shows the error/retry states; restarting recovers.
- No unexpected console errors during a normal run.
