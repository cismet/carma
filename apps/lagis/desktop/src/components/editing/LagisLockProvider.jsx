import React, { useMemo } from "react";
import { useSelector } from "react-redux";
import { LockProvider } from "@carma-providers/locking";
import { cidsLockAdapter } from "../../core/editing/lockAdapter";

const LagisLockProvider = ({ children }) => {
  const jwt = useSelector((state) => state.auth.jwt);
  const accountName = useSelector((state) => state.auth.login);
  const adapter = useMemo(() => cidsLockAdapter(jwt), [jwt]);
  return (
    <LockProvider app="lagis" user={accountName ?? ""} adapter={adapter}>
      {children}
    </LockProvider>
  );
};

export default LagisLockProvider;
