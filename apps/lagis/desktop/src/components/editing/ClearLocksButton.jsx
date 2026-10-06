import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Button, Modal, message } from "antd";
import { UnlockOutlined } from "@ant-design/icons";
import { findOwnLocks } from "../../core/editing/locks";
import { clearOwnLocks, errorMessage } from "../../core/editing/session";

// dev only (rendered behind import.meta.env.DEV): cleans up locks left by
// broken test sessions
const ClearLocksButton = () => {
  const dispatch = useDispatch();
  const jwt = useSelector((state) => state.auth.jwt);
  const accountName = useSelector((state) => state.auth.login);
  const [busy, setBusy] = useState(false);

  const clear = async (locks) => {
    setBusy(true);
    try {
      const failed = await dispatch(clearOwnLocks(locks));
      if (failed) {
        message.warning(
          `${locks.length - failed} von ${locks.length} Sperren gelöst.`
        );
      } else {
        message.success(`${locks.length} Sperren gelöst.`);
      }
    } finally {
      setBusy(false);
    }
  };

  const onClick = async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    let locks;
    try {
      locks = await findOwnLocks(accountName, jwt);
    } catch (error) {
      message.error(errorMessage(error));
      return;
    } finally {
      setBusy(false);
    }
    if (locks.length === 0) {
      message.info(`Keine Sperren von ${accountName} vorhanden.`);
      return;
    }
    Modal.confirm({
      title: "Eigene Sperren lösen?",
      content: `${locks.length} Sperren von ${accountName} werden gelöscht. Ein aktiver Bearbeitungsmodus wird beendet.`,
      okText: "Lösen",
      cancelText: "Abbrechen",
      onOk: () => clear(locks),
    });
  };

  return (
    <Button
      block
      danger
      icon={<UnlockOutlined />}
      loading={busy}
      onClick={onClick}
      data-test-id="clear-own-locks"
    >
      Eigene Sperren lösen (nur lokal)
    </Button>
  );
};

export default ClearLocksButton;
