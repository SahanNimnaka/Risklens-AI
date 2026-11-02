import { PlaceholderPage } from "../../components/layout/PlaceholderPage";

export function DashboardPage() {
  return (
    <PlaceholderPage
      title="Dashboard"
      description="Portfolio risk, audit coverage, anomaly signals and remediation status in one operational view."
      milestone="M2"
      scope={[
        "Portfolio score, band and rule breakdown",
        "Open findings by severity and department ranking",
        "Audit status coverage and recent findings",
        "Anomaly overview with advisory context",
        "Action-plan status and overdue summary",
      ]}
    />
  );
}
