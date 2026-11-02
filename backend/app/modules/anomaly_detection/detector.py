"""Peer-relative anomaly scoring for audits.

The detector turns the feature frame from
:mod:`app.modules.anomaly_detection.features` into ranked, explanatory results.
It is deterministic for a given frame, seed and estimator configuration.

Normalization is robust and department-relative:

* each feature is centred and scaled with the median and median absolute
  deviation (MAD) of the audit's department;
* if a department has fewer than ``MIN_PEER_AUDITS`` audits, or its MAD is
  zero, the global distribution is used instead;
* normalized inputs are clipped to ``[-CLIP_LIMIT, CLIP_LIMIT]`` before fitting
  so a single extreme value cannot dominate the forest; explanations report the
  unclipped deviation.

The output always says "unusual". An anomaly can be unusually bad, unusually
slow, or unusually good, so the score is not a risk score and never changes the
deterministic rule result.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Final, Sequence

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

from app.models.enums import Department
from app.modules.anomaly_detection.features import FEATURE_NAMES

#: Minimum department size before peer statistics are trusted.
MIN_PEER_AUDITS: Final[int] = 8

#: Fixed IsolationForest configuration. Contamination is an advisory cut, not a
#: discovered truth, and is deliberately not exposed through the API.
N_ESTIMATORS: Final[int] = 200
CONTAMINATION: Final[float] = 0.10
RANDOM_STATE: Final[int] = 42
N_JOBS: Final[int] = 1

#: Robust z-score constant, ``0.6745 = 1 / 1.4826``.
ROBUST_Z_CONSTANT: Final[float] = 0.6745

#: Normalized inputs are clipped for model stability only.
CLIP_LIMIT: Final[float] = 5.0

#: Number of peer-relative deviations reported per audit.
TOP_DEVIATIONS: Final[int] = 3


@dataclass(frozen=True)
class FeatureDeviation:
    """One feature's peer-relative deviation for one audit."""

    feature: str
    value: float
    peer_median: float
    robust_z: float
    direction: str


@dataclass(frozen=True)
class AuditAnomaly:
    """Anomaly result for one audit.

    ``anomaly_score`` is ``-score_samples`` from IsolationForest; higher means
    more unusual. ``score_percentile`` is the percentage of scored audits whose
    score is at or below this audit's score. ``is_anomaly`` is the model's
    advisory ``-1`` prediction at the configured contamination.
    """

    audit_ref: str
    department: Department
    audit_title: str
    anomaly_score: float
    score_percentile: float
    is_anomaly: bool
    features: dict[str, float]
    #: The three largest non-zero deviations, used by the ranked list.
    deviations: tuple[FeatureDeviation, ...]
    #: Every feature deviation, used by the single-audit detail endpoint.
    all_deviations: tuple[FeatureDeviation, ...]


@dataclass(frozen=True)
class AnomalyDetection:
    """All audit anomaly results for one ``as_of`` date."""

    as_of: date
    audits: tuple[AuditAnomaly, ...]
    feature_names: tuple[str, ...]
    contamination: float
    random_state: int
    n_estimators: int
    min_peer_audits: int

    @property
    def flagged(self) -> tuple[AuditAnomaly, ...]:
        """Only the audits whose advisory ``is_anomaly`` flag is set."""
        return tuple(audit for audit in self.audits if audit.is_anomaly)


@dataclass(frozen=True)
class PeerNormalization:
    """Robust z-scores and the peer medians used to compute them."""

    z_scores: pd.DataFrame
    peer_medians: pd.DataFrame


def _robust_z(values: pd.Series, median: float, mad: float) -> pd.Series:
    """Return the robust z-score, or zeros when MAD carries no signal."""
    if mad <= 0:
        return pd.Series(0.0, index=values.index)
    return ROBUST_Z_CONSTANT * (values - median) / mad


def normalize_features(
    features: pd.DataFrame,
    *,
    feature_names: Sequence[str] = FEATURE_NAMES,
    min_peer_audits: int = MIN_PEER_AUDITS,
) -> PeerNormalization:
    """Normalize features within departments, falling back to global statistics.

    The input must be sorted deterministically by the caller; the output keeps
    the input index and column order.
    """
    missing = [
        column
        for column in ("department", *feature_names)
        if column not in features.columns
    ]
    if missing:
        raise ValueError(
            "Feature frame is missing required column(s): " + ", ".join(missing)
        )

    z_scores = pd.DataFrame(
        0.0,
        index=features.index,
        columns=list(feature_names),
        dtype=float,
    )
    peer_medians = pd.DataFrame(
        0.0,
        index=features.index,
        columns=list(feature_names),
        dtype=float,
    )
    if features.empty:
        return PeerNormalization(z_scores=z_scores, peer_medians=peer_medians)

    for feature in feature_names:
        values = features[feature].astype(float)
        global_median = float(values.median())
        global_mad = float((values - global_median).abs().median())

        peer_medians[feature] = global_median
        z_scores[feature] = _robust_z(values, global_median, global_mad)

        for _, group in features.groupby("department", sort=True):
            group_values = group[feature].astype(float)
            peer_median = float(group_values.median())
            peer_mad = float((group_values - peer_median).abs().median())

            if len(group) >= min_peer_audits and peer_mad > 0:
                peer_medians.loc[group.index, feature] = peer_median
                z_scores.loc[group.index, feature] = _robust_z(
                    group_values,
                    peer_median,
                    peer_mad,
                )

    return PeerNormalization(z_scores=z_scores, peer_medians=peer_medians)


def _direction(robust_z: float) -> str:
    if robust_z > 0:
        return "above_peer"
    if robust_z < 0:
        return "below_peer"
    return "at_peer"


def _ordered_deviations(
    *,
    row_index: int,
    feature_names: Sequence[str],
    raw: pd.DataFrame,
    normalized: PeerNormalization,
) -> tuple[FeatureDeviation, ...]:
    """Return every feature deviation, deterministically ordered.

    Ties are broken by the fixed feature order, never by dictionary or model
    iteration order. Features with a zero z-score are included with direction
    ``at_peer`` so the detail endpoint can show the full picture.
    """
    ranked = sorted(
        range(len(feature_names)),
        key=lambda position: (
            -abs(float(normalized.z_scores.iloc[row_index, position])),
            position,
        ),
    )
    return tuple(
        FeatureDeviation(
            feature=feature_names[position],
            value=float(raw.iloc[row_index][feature_names[position]]),
            peer_median=float(normalized.peer_medians.iloc[row_index, position]),
            robust_z=float(normalized.z_scores.iloc[row_index, position]),
            direction=_direction(
                float(normalized.z_scores.iloc[row_index, position])
            ),
        )
        for position in ranked
    )


def _top_deviations(
    deviations: tuple[FeatureDeviation, ...],
    limit: int = TOP_DEVIATIONS,
) -> tuple[FeatureDeviation, ...]:
    """Return the largest non-zero deviations for the ranked list."""
    top: list[FeatureDeviation] = []
    for deviation in deviations:
        if deviation.robust_z == 0.0:
            continue
        top.append(deviation)
        if len(top) == limit:
            break
    return tuple(top)


def detect_anomalies(
    features: pd.DataFrame,
    *,
    as_of: date,
    feature_names: Sequence[str] = FEATURE_NAMES,
    contamination: float = CONTAMINATION,
    random_state: int = RANDOM_STATE,
    n_estimators: int = N_ESTIMATORS,
    min_peer_audits: int = MIN_PEER_AUDITS,
    clip_limit: float = CLIP_LIMIT,
) -> AnomalyDetection:
    """Fit IsolationForest on normalized audit features and rank the results.

    An empty frame returns an empty result instead of failing, so a date with
    no eligible audits is a valid request.
    """
    missing = [
        column
        for column in ("audit_ref", "department", "audit_title", *feature_names)
        if column not in features.columns
    ]
    if missing:
        raise ValueError(
            "Feature frame is missing required column(s): " + ", ".join(missing)
        )

    if features.empty:
        return AnomalyDetection(
            as_of=as_of,
            audits=(),
            feature_names=tuple(feature_names),
            contamination=contamination,
            random_state=random_state,
            n_estimators=n_estimators,
            min_peer_audits=min_peer_audits,
        )

    # Sort independently of the caller so fitting and output ordering are
    # deterministic even if the frame arrives in a different order.
    raw = features.sort_values("audit_ref", kind="mergesort").reset_index(drop=True)
    normalized = normalize_features(
        raw,
        feature_names=feature_names,
        min_peer_audits=min_peer_audits,
    )

    matrix = (
        normalized.z_scores[list(feature_names)]
        .clip(-clip_limit, clip_limit)
        .to_numpy(dtype=float)
    )

    model = IsolationForest(
        n_estimators=n_estimators,
        contamination=contamination,
        random_state=random_state,
        n_jobs=N_JOBS,
    )
    model.fit(matrix)

    scores = -model.score_samples(matrix)
    flags = model.predict(matrix) == -1
    percentiles = (
        pd.Series(scores).rank(method="max", pct=True).to_numpy(dtype=float) * 100.0
    )

    audits: list[AuditAnomaly] = []
    for position in range(len(raw)):
        ordered = _ordered_deviations(
            row_index=position,
            feature_names=feature_names,
            raw=raw,
            normalized=normalized,
        )
        audits.append(
            AuditAnomaly(
                audit_ref=str(raw.iloc[position]["audit_ref"]),
                department=Department(str(raw.iloc[position]["department"])),
                audit_title=str(raw.iloc[position]["audit_title"]),
                anomaly_score=float(scores[position]),
                score_percentile=float(percentiles[position]),
                is_anomaly=bool(flags[position]),
                features={
                    feature: float(raw.iloc[position][feature])
                    for feature in feature_names
                },
                deviations=_top_deviations(ordered),
                all_deviations=ordered,
            )
        )

    # Highest anomaly score first; audit_ref breaks ties deterministically.
    audits.sort(key=lambda audit: (-audit.anomaly_score, audit.audit_ref))

    return AnomalyDetection(
        as_of=as_of,
        audits=tuple(audits),
        feature_names=tuple(feature_names),
        contamination=contamination,
        random_state=random_state,
        n_estimators=n_estimators,
        min_peer_audits=min_peer_audits,
    )
