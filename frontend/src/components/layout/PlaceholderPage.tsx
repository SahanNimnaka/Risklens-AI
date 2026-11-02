import { Card } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import { InboxIcon } from "../ui/icons";
import { PageHeader } from "./PageHeader";

interface PlaceholderPageProps {
  title: string;
  description: string;
  milestone: string;
  scope: string[];
}

export function PlaceholderPage({
  title,
  description,
  milestone,
  scope,
}: PlaceholderPageProps) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <Card
        title="Implementation status"
        description={`This view is scaffolded in M1 and connected to live API data in ${milestone}.`}
      >
        <EmptyState
          icon={<InboxIcon className="h-5 w-5" />}
          title={`${title} data is not connected yet`}
          description="Routing, layout, environment configuration and shared components are in place. No placeholder metrics are shown because every number in this application must come from the API."
        />

        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Planned scope
          </p>
          <ul className="mt-2 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
            {scope.map((item) => (
              <li key={item} className="flex gap-2">
                <span
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-500"
                  aria-hidden="true"
                />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </Card>
    </>
  );
}
