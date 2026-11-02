import { Button } from "antd";
import { LockDetails } from "./LockDetails";
import { LockDialog } from "./LockDialog";
import { clientOf, takeOverWarning } from "./lockText";
import { draftRow } from "./draftRow";
import type { DraftRecord } from "./draftStore";
import type { LockNote } from "./LockDialog";
import type { HeldLock } from "./types";

export interface LockLostDialogProps {
  record: DraftRecord | undefined;
  holder: HeldLock | undefined;
  objectLabel: string;
  onRelock: () => void;
  onTakeOver: () => void;
  onDiscard: () => void;
  onLater: () => void;
  busy?: boolean;
  staleAfterHours?: number;
}

const titleOf = (holder: HeldLock | undefined, own: boolean) => {
  if (!holder) {
    return "Ihre Sperre wurde aufgehoben";
  }
  return own
    ? `In ${clientOf(holder)} übernommen`
    : `Wird von ${holder.userString} bearbeitet`;
};

const noteOf = (
  holder: HeldLock | undefined,
  own: boolean,
  staleAfterHours: number
): LockNote => {
  if (!holder) {
    return {
      type: "warning",
      message: "Die Daten können sich inzwischen geändert haben",
      description: "Prüfen Sie Ihre Änderungen vor dem Speichern.",
    };
  }
  return own
    ? takeOverWarning(holder, staleAfterHours)
    : {
        type: "info",
        message: "Ihre Änderungen können noch nicht gespeichert werden",
        description: "Das ist erst möglich, wenn die Sperre aufgehoben ist.",
      };
};

// The draft is still in this browser, but its lock is gone or no longer the
// newest row. Re-locking is offered when nobody holds the object, taking over
// when the user holds it in another client; another user's lock blocks.
export const LockLostDialog = ({
  record,
  holder,
  objectLabel,
  onRelock,
  onTakeOver,
  onDiscard,
  onLater,
  busy = false,
  staleAfterHours = 8,
}: LockLostDialogProps) => {
  const own = Boolean(record && holder && holder.userString === record.user);
  return (
    <LockDialog
      open={Boolean(record)}
      title={titleOf(holder, own)}
      details={
        <LockDetails
          objectLabel={objectLabel}
          lock={holder}
          showUser={!own}
          extra={record ? [draftRow(record)] : []}
        />
      }
      note={noteOf(holder, own, staleAfterHours)}
      onCancel={onLater}
      actions={
        <>
          <Button danger disabled={busy} onClick={onDiscard}>
            Verwerfen
          </Button>
          {!holder && (
            <Button type="primary" loading={busy} onClick={onRelock}>
              Erneut sperren
            </Button>
          )}
          {own && (
            <Button type="primary" loading={busy} onClick={onTakeOver}>
              Bearbeitung übernehmen
            </Button>
          )}
        </>
      }
    />
  );
};
