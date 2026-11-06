import { createContext, useContext } from "react";
import type { DraftStore } from "./draftStore";
import type { LockAdapter } from "./types";

export interface LockContextValue {
  app: string;
  user: string;
  adapter: LockAdapter;
  drafts: DraftStore;
}

export const LockContext = createContext<LockContextValue | null>(null);

export const useLockContext = () => {
  const value = useContext(LockContext);
  if (!value) {
    throw new Error("useLockContext needs a LockProvider");
  }
  return value;
};
