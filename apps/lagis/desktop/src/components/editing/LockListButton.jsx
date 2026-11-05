import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { LockListButton as SharedLockListButton } from "@carma-providers/locking";
import { getJWT } from "../../store/slices/auth";
import { findAllLocks, unlockObject } from "../../core/editing/locks";
import { errorMessage } from "../../core/editing/session";
import { canUnlockAll } from "../../core/editing/permissions";

const NESTED = { show: true, unlockTogether: true };

const LockListButton = () => {
  const jwt = useSelector(getJWT);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let current = true;
    setAllowed(false);
    if (jwt) {
      canUnlockAll(jwt).then((granted) => current && setAllowed(granted));
    }
    return () => {
      current = false;
    };
  }, [jwt]);

  const unlock = async (item, nested) => {
    const results = await Promise.allSettled(
      [item, ...nested].map(({ lock }) => unlockObject(lock, jwt))
    );
    const failed = results.find(({ status }) => status === "rejected");
    if (failed) {
      throw failed.reason;
    }
  };

  return (
    <SharedLockListButton
      allowed={allowed}
      load={() => findAllLocks(jwt)}
      unlock={unlock}
      nested={NESTED}
      errorText={errorMessage}
      iconClassName="text-sm cursor-pointer"
      iconStyle={{ paddingRight: "12px" }}
    />
  );
};

export default LockListButton;
