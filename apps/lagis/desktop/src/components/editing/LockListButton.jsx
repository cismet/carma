import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { Tooltip, message } from "antd";
import { LockOutlined } from "@ant-design/icons";
import { LockListDialog } from "@carma-providers/locking";
import { getJWT } from "../../store/slices/auth";
import { findAllLocks, unlockObject } from "../../core/editing/locks";
import { errorMessage } from "../../core/editing/session";
import { canUnlockAll } from "../../core/editing/permissions";

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

  const unlock = async (item) => {
    try {
      await unlockObject(item.lock, jwt);
      setItems((current) => current?.filter(({ key }) => key !== item.key));
      message.success(`${item.objectLabel} entsperrt`);
    } catch (e) {
      message.error(errorMessage(e));
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
        onUnlock={unlock}
        onReload={load}
        onClose={() => setOpen(false)}
      />
    </>
  );
};

export default LockListButton;
