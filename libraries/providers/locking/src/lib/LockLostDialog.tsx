import { Alert, Button, Modal, Popconfirm } from "antd";
import { clientOf, describeLock, isJavaLock, isStaleLock } from "./lockText";
import type { DraftRecord } from "./draftStore";
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

const formatSavedAt = (iso: string) =>
  new Date(iso).toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  });

const reasonOf = (
  record: DraftRecord,
  holder: HeldLock | undefined,
  objectLabel: string
) => {
  if (!holder) {
    return "Ihre Sperre wurde aufgehoben.";
  }
  return holder.userString === record.user
    ? `Sie haben die Bearbeitung ${describeLock(holder)} übernommen.`
    : `${objectLabel} wird jetzt von ${
        holder.userString
      } bearbeitet (${describeLock(holder)}).`;
};

const holderWarning = (holder: HeldLock, staleAfterHours: number) => {
  if (isJavaLock(holder)) {
    return {
      type: "error" as const,
      text: "Die Java-Anwendung prüft ihre Sperre beim Speichern nicht: Änderungen, die dort noch gespeichert werden, überschreiben Ihre. Beenden Sie dort zuerst den Bearbeitungsmodus.",
    };
  }
  return isStaleLock(holder, staleAfterHours)
    ? {
        type: "info" as const,
        text: `Die Sperre ist älter als ${String(
          staleAfterHours
        )} Stunden. Wahrscheinlich wurde die Bearbeitung dort nicht beendet.`,
      }
    : undefined;
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
  const warning = own && holder && holderWarning(holder, staleAfterHours);
  return (
    <Modal
      open={Boolean(record)}
      title={`Sperre für ${objectLabel} verloren`}
      maskClosable={false}
      onCancel={onLater}
      footer={[
        <Button key="discard" danger disabled={busy} onClick={onDiscard}>
          Verwerfen
        </Button>,
        holder && (
          <Button key="later" disabled={busy} onClick={onLater}>
            Später
          </Button>
        ),
        !holder && (
          <Button key="relock" type="primary" loading={busy} onClick={onRelock}>
            Erneut sperren
          </Button>
        ),
        own && holder && (
          <Popconfirm
            key="takeOver"
            title="Bearbeitung übernehmen?"
            description={`Ungespeicherte Änderungen in ${clientOf(
              holder
            )} gehen verloren.`}
            okText="Übernehmen"
            cancelText="Abbrechen"
            onConfirm={onTakeOver}
          >
            <Button type="primary" loading={busy}>
              Übernehmen
            </Button>
          </Popconfirm>
        ),
      ]}
    >
      {record && (
        <>
          <p>{reasonOf(record, holder, objectLabel)}</p>
          <p>
            Ihre Änderungen vom {formatSavedAt(record.savedAt)} sind noch in
            diesem Browser gespeichert
            {holder && !own ? ", können aber nicht gespeichert werden." : "."}
          </p>
          {warning && (
            <Alert
              type={warning.type}
              showIcon
              message={warning.text}
              className="mb-3"
            />
          )}
          {(!holder || own) && (
            <p className="text-gray-600">
              Die Daten können sich inzwischen geändert haben. Prüfen Sie Ihre
              Änderungen vor dem Speichern.
            </p>
          )}
        </>
      )}
    </Modal>
  );
};
