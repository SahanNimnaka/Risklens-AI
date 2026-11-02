import { PlaceholderPage } from "../../components/layout/PlaceholderPage";

export function AnomaliesPage() {
  return (
    <PlaceholderPage
      title="Anomalies"
      description="Explore audits that are statistically unusual relative to their peers. A flag is advisory and does not indicate fraud or misconduct."
      milestone="M5"
      scope={[
        "Ranked anomaly scores and percentiles",
        "Advisory flags with a plain-language disclaimer",
        "Peer-relative feature deviations",
        "Department and flagged-only filters",
        "Detector metadata in a detail panel",
      ]}
    />
  );
}
