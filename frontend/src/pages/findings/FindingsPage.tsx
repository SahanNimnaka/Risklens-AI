import { PlaceholderPage } from "../../components/layout/PlaceholderPage";

export function FindingsPage() {
  return (
    <PlaceholderPage
      title="Risk findings"
      description="Review audit findings with their severity, remediation status and deterministic rule attribution."
      milestone="M4"
      scope={[
        "Finding register with severity and status filters",
        "Direct risk score, band and triggering rule IDs",
        "Rule reasons and typed evidence in a detail panel",
        "Entity-level R4 and R6 hits shown separately",
        "Clear distinction between finding and alert severity",
      ]}
    />
  );
}
