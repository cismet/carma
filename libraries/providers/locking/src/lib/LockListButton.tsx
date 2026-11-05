import { useState } from "react";
import type { CSSProperties } from "react";
import { Tooltip, message } from "antd";
import { LockOutlined } from "@ant-design/icons";
import { LockListDialog } from "./LockListDialog";
import type { LockListItem, LockListNesting } from "./LockListDialog";

export interface LockListButtonProps {
  allowed: boolean;
  load: () => Promise<LockListItem[]>;
  // throws if not everything could be unlocked
  unlock: (item: LockListItem, nested: LockListItem[]) => Promise<void>;
  nested?: LockListNesting;
  errorText?: (error: unknown) => string;
  iconClassName?: string;
  iconStyle?: CSSProperties;
}

const defaultErrorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export const LockListButton = ({
  allowed,
  load: loadItems,
  unlock: unlockItem,
  nested,
  errorText = defaultErrorText,
  iconClassName = "cursor-pointer",
  iconStyle,
}: LockListButtonProps) => {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<LockListItem[] | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const load = async () => {
    setLoading(true);
    setError(undefined);
    try {
      setItems(await loadItems());
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  };

  // reloaded either way: after a partial failure only the server knows
  // what is still locked
  const unlock = async (item: LockListItem, nestedItems: LockListItem[]) => {
    try {
      await unlockItem(item, nestedItems);
      message.success(
        nestedItems.length
          ? `${item.objectLabel} und ${String(
              nestedItems.length
            )} verschachtelte Objekte entsperrt`
          : `${item.objectLabel} entsperrt`
      );
    } catch (e) {
      message.error(errorText(e));
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
          className={iconClassName}
          style={iconStyle}
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
        {...(nested ? { nested } : {})}
        onUnlock={unlock}
        onReload={() => void load()}
        onClose={() => setOpen(false)}
      />
    </>
  );
};
