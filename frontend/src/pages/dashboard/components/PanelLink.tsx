import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { buttonClasses } from "../../../components/ui/Button";

export function PanelLink({
  to,
  children,
}: {
  to: string;
  children: ReactNode;
}) {
  return (
    <Link to={to} className={buttonClasses("ghost", "sm")}>
      {children}
    </Link>
  );
}
