import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Button, Modal } from "antd";
import { UnlockOutlined } from "@ant-design/icons";
import { findOwnLocks } from "../../core/editing/locks";
import { clearOwnLocks, errorMessage } from "../../core/editing/session";
import { notifyLocksCleared } from "./lockNotices";

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
        notifyLocksCleared(
          "warning",
          `${locks.length - failed} von ${
            locks.length
          } Sperren gelöst. Bitte erneut versuchen.`
        );
      } else {
        notifyLocksCleared("success", `${locks.length} Sperren gelöst.`);
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
      notifyLocksCleared("error", errorMessage(error));
      return;
    } finally {
      setBusy(false);
    }
    if (locks.length === 0) {
      notifyLocksCleared("info", `Keine Sperren von ${accountName} vorhanden.`);
      return;
    }
    Modal.confirm({
      title: `Alle Sperren von ${accountName} lösen?`,
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
      Meine Sperren lösen (nur lokal)
    </Button>
  );
};

export default ClearLocksButton;
