import { useMemo, type ReactNode } from "react";
import { createDraftStore } from "./draftStore";
import { LockContext } from "./lockContext";
import type { LockAdapter } from "./types";

export interface LockProviderProps {
  app: string;
  user: string;
  adapter: LockAdapter;
  children: ReactNode;
}

export const LockProvider = ({
  app,
  user,
  adapter,
  children,
}: LockProviderProps) => {
  const drafts = useMemo(() => createDraftStore(app), [app]);
  const value = useMemo(
    () => ({ app, user, adapter, drafts }),
    [app, user, adapter, drafts]
  );
  return <LockContext.Provider value={value}>{children}</LockContext.Provider>;
};
