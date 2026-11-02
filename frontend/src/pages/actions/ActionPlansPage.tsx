import { PlaceholderPage } from "../../components/layout/PlaceholderPage";

export function ActionPlansPage() {
  return (
    <PlaceholderPage
      title="Action plans"
      description="Track remediation ownership, due dates and overdue actions against the findings they address."
      milestone="M6"
      scope={[
        "Action register with owner and current status",
        "Due and completion dates",
        "Backend-computed overdue state and days overdue",
        "Filters for status, department and overdue work",
        "Read-only detail panel with finding context",
      ]}
    />
  );
}
