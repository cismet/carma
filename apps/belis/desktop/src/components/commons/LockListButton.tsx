import { useSelector } from "react-redux";
import { LockListButton as SharedLockListButton } from "@carma-providers/locking";
import type { LockListItem } from "@carma-providers/locking";
import { canUnlockAll, getJWT } from "../../store/slices/auth";
import { belisLockAdapter, removeLockRow } from "../../helper/lockAdapter";
import { findAllLockItems, rowIdOf } from "./lockListItems";

const NESTED = { show: true, unlockTogether: true };

const LockListButton = () => {
  const jwt = useSelector(getJWT) as string | undefined;
  const allowed = useSelector(canUnlockAll) as boolean;

  const remove = async (jwtValue: string, item: LockListItem) => {
    const rowId = rowIdOf(item);
    if (rowId !== undefined) {
      await removeLockRow(jwtValue, rowId);
      return;
    }
    const adapter = belisLockAdapter(jwtValue);
    for (const row of [item.lock, ...item.lock.history]) {
      await adapter.remove(row.id);
    }
  };

  const unlock = async (item: LockListItem) => {
    if (!jwt) return;
    try {
      await remove(jwt, item);
    } catch (error) {
      throw new Error(
        `Die Sperre konnte nicht vollständig gelöst werden: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  };

  return (
    <SharedLockListButton
      allowed={allowed && Boolean(jwt)}
      load={() => (jwt ? findAllLockItems(jwt) : Promise.resolve([]))}
      unlock={unlock}
      nested={NESTED}
      iconClassName="text-base cursor-pointer"
    />
  );
};

export default LockListButton;
