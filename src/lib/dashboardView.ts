import { useCallback, useState } from "react";

import type { DashboardView } from "../components/DashboardSections";

const STORAGE_KEY = "stake-advance-view";

function loadView(): DashboardView {
  if (typeof window === "undefined") return "member";

  const stored = sessionStorage.getItem(STORAGE_KEY);
  if (stored === "member" || stored === "vendor" || stored === "operator") {
    return stored;
  }

  return "member";
}

export function useDashboardView() {
  const [currentView, setCurrentViewState] = useState<DashboardView>(loadView);

  const setCurrentView = useCallback((view: DashboardView) => {
    sessionStorage.setItem(STORAGE_KEY, view);
    setCurrentViewState(view);
  }, []);

  return [currentView, setCurrentView] as const;
}
