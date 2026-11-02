import { BrowserRouter } from "react-router-dom";

import { AppShell } from "./components/layout/AppShell";
import { AsOfProvider } from "./hooks/useAsOf";
import { AppRoutes } from "./routes";

export default function App() {
  return (
    <BrowserRouter>
      <AsOfProvider>
        <AppShell>
          <AppRoutes />
        </AppShell>
      </AsOfProvider>
    </BrowserRouter>
  );
}
