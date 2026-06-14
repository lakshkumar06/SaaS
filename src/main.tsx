import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import { DynamicProvider } from "./components/DynamicProvider";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DynamicProvider>
      <App />
    </DynamicProvider>
  </StrictMode>,
);
