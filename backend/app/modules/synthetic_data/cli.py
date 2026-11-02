"""Command line entry point for the synthetic dataset.

Generate and validate in memory (no database writes):

    python -m app.modules.synthetic_data.cli --out-dir data/synthetic

Validate and load into PostgreSQL:

    python -m app.modules.synthetic_data.cli --load

Delete synthetic rows and reload (manual rows are left alone):

    python -m app.modules.synthetic_data.cli --reset-synthetic
"""

from __future__ import annotations

import argparse
import json
from datetime import date
from pathlib import Path
from typing import Any, Sequence

from app.core.config import settings
from app.modules.synthetic_data.generator import (
    DEFAULT_TOTAL_AUDITS,
    SyntheticDatasetGenerator,
)
from app.modules.synthetic_data.validation import DatasetReport, validate_dataset


def _parse_date(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError(
            f"expected an ISO date (YYYY-MM-DD), got {value!r}"
        ) from error


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Generate, validate and load the fictional RiskLens AI audit dataset.",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=settings.synthetic_data_seed,
        help="Random seed (default: %(default)s)",
    )
    parser.add_argument(
        "--reference-date",
        type=_parse_date,
        default=settings.synthetic_data_reference_date,
        help="Dataset anchor date, ISO format (default: %(default)s)",
    )
    parser.add_argument(
        "--audits",
        type=int,
        default=DEFAULT_TOTAL_AUDITS,
        help="Number of audit engagements (default: %(default)s)",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=None,
        help="Optional directory for CSV exports",
    )
    parser.add_argument(
        "--load",
        action="store_true",
        help="Validate, then write the dataset to the database",
    )
    parser.add_argument(
        "--reset-synthetic",
        action="store_true",
        help=(
            "Delete rows with synthetic refs and reload (implies --load; "
            "manually created rows are not touched)"
        ),
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print the validation and load reports as JSON",
    )
    return parser


def format_report(report: DatasetReport) -> str:
    counts = report.counts
    lines = [
        f"Synthetic dataset (seed={report.seed}, reference date={report.reference_date})",
        (
            f"audits={counts['audits']}  controls={counts['controls']}  "
            f"findings={counts['findings']}  action_plans={counts['action_plans']}"
        ),
        (
            "finding dates: "
            f"{report.occurrence_range[0]} to {report.occurrence_range[1]}"
        ),
        "severity:        " + ", ".join(f"{k}={v}" for k, v in report.severity_counts.items()),
        "finding status:  " + ", ".join(f"{k}={v}" for k, v in report.finding_status_counts.items()),
        "action status:   " + ", ".join(f"{k}={v}" for k, v in report.action_status_counts.items()),
        (
            f"overdue actions={report.overdue_actions}  "
            f"blocked={report.blocked_actions}  completed={report.completed_actions}"
        ),
        (
            f"unresolved criticals={report.critical_unresolved}  "
            f"weak-control findings={report.weak_control_findings} "
            f"(ineffective={report.ineffective_control_findings})  "
            f"audits with 2+ findings={report.multi_finding_audits}"
        ),
        f"recurring root-cause clusters ({len(report.recurrence_clusters)}):",
    ]
    for cluster in report.recurrence_clusters:
        lines.append(
            "  - "
            f"{cluster['department']} / {cluster['root_cause_category']}: "
            f"{cluster['count']} findings "
            f"({cluster['window_start']} to {cluster['window_end']})"
        )
    return "\n".join(lines)


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    if args.audits < 1:
        raise SystemExit("--audits must be at least 1")

    bundle = SyntheticDatasetGenerator(
        seed=args.seed,
        reference_date=args.reference_date,
        total_audits=args.audits,
    ).generate()
    report = validate_dataset(bundle)

    payload: dict[str, Any] = {"validation": report.as_dict()}
    if not args.json:
        print(format_report(report))

    if args.out_dir is not None:
        args.out_dir.mkdir(parents=True, exist_ok=True)
        exports: dict[str, Any] = {
            "audits": bundle.audits,
            "controls": bundle.controls,
            "findings": bundle.findings,
            "action_plans": bundle.action_plans,
        }
        payload["exports"] = {}
        for name, frame in exports.items():
            path = args.out_dir / f"{name}.csv"
            frame.to_csv(path, index=False, date_format="%Y-%m-%d")
            payload["exports"][name] = {"path": str(path), "rows": len(frame)}
            if not args.json:
                print(f"wrote {path} ({len(frame)} rows)")

    if args.load or args.reset_synthetic:
        # Imported lazily so generate-only runs never create a database engine.
        from app.db.session import SessionLocal
        from app.modules.synthetic_data.loader import (
            format_loader_report,
            load_dataset,
        )

        with SessionLocal() as session:
            load_report = load_dataset(
                session,
                bundle,
                reset=args.reset_synthetic,
                report=report,
            )

        payload["load"] = load_report.as_dict()
        if not args.json:
            print()
            print(format_loader_report(load_report))

    if args.json:
        print(json.dumps(payload, indent=2, sort_keys=True))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
