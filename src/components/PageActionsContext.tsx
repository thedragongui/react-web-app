import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

type PageActionsContextValue = {
  actions: ReactNode | null;
  setActions: (next: ReactNode | null) => void;
};

const PageActionsContext = createContext<PageActionsContextValue | undefined>(undefined);

export function PageActionsProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<ReactNode | null>(null);
  const value = useMemo(() => ({ actions, setActions }), [actions]);
  return <PageActionsContext.Provider value={value}>{children}</PageActionsContext.Provider>;
}

export function usePageActions() {
  const ctx = useContext(PageActionsContext);
  if (!ctx) {
    throw new Error('usePageActions must be used within a PageActionsProvider');
  }
  return ctx;
}
