# RiskLens AI

### Explainable Risk Monitoring & Internal Audit Analytics

RiskLens AI is a risk-monitoring and internal-audit analytics platform designed to help users explore audit risk, review findings, monitor action plans, and identify unusual audit patterns through a centralized dashboard.

The project combines **deterministic, explainable risk rules** with **machine-learning-based anomaly detection**. It is built around synthetic data and is intended as a demonstrable analytics platform—not a production fraud-detection system.

---

## Overview

Internal audit teams often need to bring together audit records, control information, findings, and remediation actions to understand where attention may be required.

RiskLens AI provides a unified, read-only interface for exploring this information, with date-aware views and traceable relationships between audits, findings, and action plans.

### Key capabilities

- **Risk Dashboard** — Overview of risk scores, severity, risk-rule hits, and unresolved items.
- **Audit Register** — Browse audit records and inspect their risk context.
- **Findings Register** — Review findings, severity, related audit information, and associated actions.
- **Action Plans** — Monitor remediation actions and overdue status.
- **Anomaly Register** — Surface audits with unusual patterns for further review.
- **Historical Views** — Explore data using an `as_of` date.
- **URL-Synced Filters** — Share filtered views and retain state across reloads and browser navigation.
- **Audit-to-Action Traceability** — Navigate from an audit to its findings and related action plans.
- **Demo Runbook** — Reproducible instructions for running and exploring the application.

---

## How It Works

RiskLens AI uses two complementary approaches:

### 1. Deterministic Risk Scoring

The backend evaluates audit and control data using defined risk rules **R1–R6**. These rules produce explainable risk results, including severity, rule hits, and unresolved-risk context.

The scoring logic is implemented in the backend. The frontend displays the returned results rather than recalculating risk independently.

### 2. Machine-Learning Anomaly Detection

The anomaly module uses **Isolation Forest** to identify audit records with unusual patterns relative to the available data.

The pipeline includes feature preparation, eligibility checks, peer normalization, and clipping. Anomaly results are advisory signals intended to help prioritize review.

> An anomaly flag indicates an unusual pattern. It does **not** establish fraud, misconduct, or a confirmed control failure.

---

## Architecture

```text
                 ┌──────────────────────────┐
                 │     React Frontend       │
                 │  TypeScript · Vite       │
                 │  Tailwind CSS · Recharts  │
                 └────────────┬─────────────┘
                              │ REST API
                              ▼
                 ┌──────────────────────────┐
                 │      FastAPI Backend      │
                 │  Risk Rules R1–R6         │
                 │  Isolation Forest         │
                 │  API Validation           │
                 └────────────┬─────────────┘
                              │
                              ▼
                 ┌──────────────────────────┐
                 │       PostgreSQL          │
                 │  Audits                   │
                 │  Controls                 │
                 │  Findings                 │
                 │  Action Plans              │
                 └──────────────────────────┘
```

### Technology Stack

| Area | Technologies |
|---|---|
| Frontend | React, TypeScript, Vite |
| Styling | Tailwind CSS |
| Data Visualization | Recharts |
| Backend | Python, FastAPI, Pydantic |
| Data Processing | Pandas, NumPy, SciPy |
| Machine Learning | scikit-learn, Isolation Forest |
| Database | PostgreSQL |
| ORM & Migrations | SQLAlchemy, Alembic |
| Testing | Pytest, frontend test suite |

---

## Data Model

The application works with four core entities:

| Entity | Purpose |
|---|---|
| **Audits** | Audit records and their context |
| **Controls** | Control-related information used in risk evaluation |
| **Findings** | Issues identified within audits |
| **Action Plans** | Remediation actions associated with findings |

The project uses **repeatable synthetic data** to support consistent testing and demonstrations.

---

## Project Structure

```text
RiskLens-AI/
├── backend/
│   ├── alembic/
│   ├── ...
│   └── ...
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   ├── components/
│   │   ├── pages/
│   │   └── ...
│   └── ...
├── docs/
│   ├── DEMO.md
│   └── PROGRESS.md
├── README.md
└── ...
```

*The structure above is a high-level overview; consult the repository for the complete file layout.*

---

## Getting Started

### Prerequisites

Install the following before running the project:

- Python
- Node.js and npm
- PostgreSQL
- Git

### 1. Clone the repository

```bash
git clone https://github.com/SahanNimnaka/Risklens-AI.git
cd Risklens-AI
```

### 2. Configure the backend

Create and activate a Python virtual environment:

```bash
python -m venv .venv
```

On Windows PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
```

Install the backend dependencies using the dependency file included in the backend directory.

Configure the required environment variables for your local PostgreSQL database. **Use the repository’s environment example and backend instructions for the exact variable names.**

Apply database migrations and load the synthetic demo data using the project’s documented commands.

### 3. Start the backend

Run the FastAPI application using the backend’s development command.

The API provides a health endpoint and endpoints for risk summaries, anomalies, audits, findings, and action plans.

### 4. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite.

> For the complete, verified setup and demonstration workflow, see [`docs/DEMO.md`](docs/DEMO.md).

---

## Testing & Validation

The project’s latest reported validation results:

| Check | Result |
|---|---|
| Backend tests | **139 passed** |
| Frontend tests | **86 passed across 10 files** |
| Frontend typecheck | Passed |
| Frontend production build | Succeeded |
| Git diff check | Clean |

The production build currently reports a bundle-size warning. It is known and has not been treated as a blocker for the controlled local demo.

---

## Demo

The demo uses synthetic data and is designed to be repeatable.

A recommended walkthrough:

1. Open the RiskLens AI dashboard.
2. Review the overall risk summary.
3. Open the audit register and inspect an audit.
4. Follow the audit to its related findings.
5. Open a finding and inspect its associated action plan.
6. Explore the anomaly register and review flagged unusual patterns.
7. Change the `as_of` date and observe the historical view.
8. Test the documented API outage and recovery behavior.

See **[`docs/DEMO.md`](docs/DEMO.md)** for the full runbook.

---

## Design Principles

RiskLens AI follows several deliberate design constraints:

- **Explainability:** Deterministic risk results are tied to defined backend rules.
- **Separation of concerns:** Risk calculations remain in the backend; the frontend presents API results.
- **Read-only interface:** The frontend is designed for reviewing and exploring data.
- **Advisory anomaly detection:** Unusual patterns are signals for review, not conclusions.
- **Repeatability:** Synthetic data supports consistent demonstrations and testing.
- **Historical context:** Date-aware views help explore data at a selected point in time.

---

## Limitations

RiskLens AI is currently a **portfolio and demonstration project**, not a production-ready audit platform.

- The demo uses synthetic data rather than validated operational audit data.
- Anomaly detection has not been validated against labeled real-world fraud or misconduct cases.
- Anomaly flags should not be interpreted as confirmed wrongdoing.
- Authentication, authorization, and production deployment hardening are outside the current scope.
- The application is intended for controlled demonstrations and technical evaluation.

---

## Roadmap

Potential future work includes:

- Evaluating anomaly detection with validated, labeled datasets
- Improving model evaluation and monitoring
- Adding stronger access controls for a production environment
- Optimizing frontend bundle size
- Expanding reporting and audit analytics capabilities

These are possible future directions, not currently implemented features.

---

## Author

**Sahan Nimnaka**

- GitHub: [@SahanNimnaka](https://github.com/SahanNimnaka)


---

## Disclaimer

RiskLens AI is an educational and portfolio project. It is not a substitute for professional internal-audit judgment, formal investigations, or validated enterprise risk-management systems.
