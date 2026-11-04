import { useMemo, type ReactNode } from "react";
import { LockProvider } from "@carma-providers/locking";
import { belisLockAdapter } from "../../helper/lockAdapter";
import DraftLockGuard from "./DraftLockGuard";

interface BelisLockProviderProps {
  jwt: string;
  login: string | null | undefined;
  children: ReactNode;
}

const BelisLockProvider = ({
  jwt,
  login,
  children,
}: BelisLockProviderProps) => {
  const adapter = useMemo(() => belisLockAdapter(jwt), [jwt]);
  return (
    <LockProvider app="belis" user={login ?? ""} adapter={adapter}>
      {login && <DraftLockGuard />}
      {children}
    </LockProvider>
  );
};

export default BelisLockProvider;
