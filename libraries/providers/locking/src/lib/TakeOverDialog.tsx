import { Button } from "antd";
import { LockDetails } from "./LockDetails";
import { LockDialog } from "./LockDialog";
import { isJavaLock, takeOverWarning } from "./lockText";
import type { HeldLock } from "./types";

export interface TakeOverDialogProps {
  lock: HeldLock | undefined;
  objectLabel: string;
  onTakeOver: () => void;
  onCancel: () => void;
  busy?: boolean;
  staleAfterHours?: number;
}

export const TakeOverDialog = ({
  lock,
  objectLabel,
  onTakeOver,
  onCancel,
  busy = false,
  staleAfterHours = 8,
}: TakeOverDialogProps) => (
  <LockDialog
    open={Boolean(lock)}
    title="Von Ihnen gesperrt"
    details={<LockDetails objectLabel={objectLabel} lock={lock} />}
    note={lock && takeOverWarning(lock, staleAfterHours)}
    onCancel={onCancel}
    actions={
      <>
        <Button disabled={busy} onClick={onCancel}>
          Abbrechen
        </Button>
        <Button
          type="primary"
          danger={lock && isJavaLock(lock)}
          loading={busy}
          onClick={onTakeOver}
        >
          Bearbeitung übernehmen
        </Button>
      </>
    }
  />
);
