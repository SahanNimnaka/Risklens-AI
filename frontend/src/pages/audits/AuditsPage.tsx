import { PlaceholderPage } from "../../components/layout/PlaceholderPage";

export function AuditsPage() {
  return (
    <PlaceholderPage
      title="Audits"
      description="Browse audit engagements, their coverage and the findings and actions raised against them."
      milestone="M3"
      scope={[
        "Searchable audit register with department and type",
        "Status, dates, lead auditor and engagement counts",
        "Filters for department, type and status",
        "Sortable columns and an audit detail panel",
        "Links to related findings and action plans",
      ]}
    />
  );
}
