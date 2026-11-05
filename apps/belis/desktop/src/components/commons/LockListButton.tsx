import { useState } from "react";
import { useSelector } from "react-redux";
import { Tooltip, message } from "antd";
import { LockOutlined } from "@ant-design/icons";
import { LockListDialog } from "@carma-providers/locking";
import type { LockListItem } from "@carma-providers/locking";
import { canUnlockAll, getJWT } from "../../store/slices/auth";
import { belisLockAdapter, removeLockRow } from "../../helper/lockAdapter";
import { findAllLockItems, rowIdOf } from "./lockListItems";

const NESTED = { show: true, unlockTogether: true };

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const LockListButton = () => {
  const jwt = useSelector(getJWT) as string | undefined;
  const allowed = useSelector(canUnlockAll) as boolean;
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<LockListItem[] | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const load = async () => {
    if (!jwt) return;
    setLoading(true);
    setError(undefined);
    try {
      setItems(await findAllLockItems(jwt));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  };

  const unlock = async (item: LockListItem, nested: LockListItem[]) => {
    if (!jwt) return;
    const rowId = rowIdOf(item);
    try {
      if (rowId === undefined) {
        const adapter = belisLockAdapter(jwt);
        for (const row of [item.lock, ...item.lock.history]) {
          await adapter.remove(row.id);
        }
      } else {
        await removeLockRow(jwt, rowId);
      }
      message.success(
        nested.length
          ? `${item.objectLabel} mit ${String(
              nested.length
            )} verschachtelten Objekten entsperrt`
          : `${item.objectLabel} entsperrt`
      );
    } catch (e) {
      message.error(
        `Die Sperre konnte nicht vollständig gelöst werden: ${errorText(e)}`
      );
    }
    await load();
  };

  if (!allowed) {
    return null;
  }

  return (
    <>
      <Tooltip title="Gesperrte Objekte" placement="bottom">
        <LockOutlined
          className="text-base cursor-pointer"
          onClick={() => {
            setOpen(true);
            void load();
          }}
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
        onReload={() => void load()}
        onClose={() => setOpen(false)}
      />
    </>
  );
};

export default LockListButton;
