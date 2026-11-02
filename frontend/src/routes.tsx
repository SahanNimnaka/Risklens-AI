import { Route, Routes } from "react-router-dom";

import { ActionPlansPage } from "./pages/actions/ActionPlansPage";
import { AnomaliesPage } from "./pages/anomalies/AnomaliesPage";
import { AuditsPage } from "./pages/audits/AuditsPage";
import { DashboardPage } from "./pages/dashboard/DashboardPage";
import { FindingsPage } from "./pages/findings/FindingsPage";
import { NotFoundPage } from "./pages/NotFoundPage";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/audits" element={<AuditsPage />} />
      <Route path="/findings" element={<FindingsPage />} />
      <Route path="/anomalies" element={<AnomaliesPage />} />
      <Route path="/actions" element={<ActionPlansPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
