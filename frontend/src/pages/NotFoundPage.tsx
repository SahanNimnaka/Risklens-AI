import { Link } from "react-router-dom";

import { PageHeader } from "../components/layout/PageHeader";
import { buttonClasses } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";

export function NotFoundPage() {
  return (
    <>
      <PageHeader
        title="Page not found"
        description="The requested view does not exist."
      />
      <Card>
        <EmptyState
          title="Nothing to show here"
          description="Check the address or return to the dashboard to continue exploring the audit portfolio."
          action={
            <Link to="/" className={buttonClasses("primary")}>
              Return to dashboard
            </Link>
          }
        />
      </Card>
    </>
  );
}
