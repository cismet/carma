import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { Tooltip, message } from "antd";
import { LockOutlined } from "@ant-design/icons";
import { LockListDialog } from "@carma-providers/locking";
import { getJWT } from "../../store/slices/auth";
import { findAllLocks, unlockObject } from "../../core/editing/locks";
import { errorMessage } from "../../core/editing/session";
import { canUnlockAll } from "../../core/editing/permissions";

const NESTED = { show: true, unlockTogether: true };

const LockListButton = () => {
  const jwt = useSelector(getJWT);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(undefined);
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

  const load = async () => {
    setLoading(true);
    setError(undefined);
    try {
      setItems(await findAllLocks(jwt));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const show = () => {
    setOpen(true);
    load();
  };

  const unlock = async (item, nested) => {
    const all = [item, ...nested];
    const results = await Promise.allSettled(
      all.map(({ lock }) => unlockObject(lock, jwt))
    );
    const unlocked = new Set(
      all
        .filter((_, i) => results[i].status === "fulfilled")
        .map(({ key }) => key)
    );
    setItems((current) => current?.filter(({ key }) => !unlocked.has(key)));
    const failed = results.find(({ status }) => status === "rejected");
    if (failed) {
      message.error(errorMessage(failed.reason));
    } else {
      message.success(
        nested.length
          ? `${item.objectLabel} und ${nested.length} verschachtelte Objekte entsperrt`
          : `${item.objectLabel} entsperrt`
      );
    }
  };

  if (!allowed) {
    return null;
  }

  return (
    <>
      <Tooltip title="Gesperrte Objekte" placement="bottom">
        <LockOutlined
          className="text-sm cursor-pointer"
          style={{ paddingRight: "12px" }}
          onClick={show}
          data-test-id="open-lock-list"
        />
      </Tooltip>
      <LockListDialog
        open={open}
        items={items}
        loading={loading}
        error={error}
        nested={NESTED}
        onUnlock={unlock}
        onReload={load}
        onClose={() => setOpen(false)}
      />
    </>
  );
};

export default LockListButton;
