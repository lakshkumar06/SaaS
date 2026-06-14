import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { DynamicDashboardApp, ReadonlyDashboardApp } from "./App";
import { DynamicProvider } from "./components/DynamicProvider";
import { dynamicEnvironmentId } from "./lib/env";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {dynamicEnvironmentId ? (
      <DynamicProvider>
        <DynamicDashboardApp />
      </DynamicProvider>
    ) : (
      <ReadonlyDashboardApp />
    )}
  </StrictMode>,
);
