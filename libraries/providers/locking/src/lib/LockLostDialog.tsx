import { Alert, Button, Flex, Modal, Typography } from "antd";
import { LockDetails } from "./LockDetails";
import { clientOf, takeOverWarning } from "./lockText";
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

const CHANGED_HINT =
  "Die Daten können sich inzwischen geändert haben. Prüfen Sie Ihre Änderungen vor dem Speichern.";

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
  const intro = !holder
    ? `Ihre Sperre wurde aufgehoben. Sie können ${objectLabel} erneut sperren und mit Ihren Änderungen weiterarbeiten.`
    : own
    ? `Sie haben die Bearbeitung in ${clientOf(
        holder
      )} übernommen. Sie können sie mit den Änderungen aus diesem Browser zurückholen.`
    : `${objectLabel} wird jetzt von ${holder.userString} bearbeitet. Ihre Änderungen können erst gespeichert werden, wenn die Sperre aufgehoben ist.`;
  const warning =
    holder && own ? takeOverWarning(holder, staleAfterHours) : undefined;
  const savedAt = record && {
    key: "draft",
    label: "Ihre Änderungen",
    value: `${record.client} · ${formatSavedAt(record.savedAt)}`,
  };
  return (
    <Modal
      open={Boolean(record)}
      title={`Sperre für ${objectLabel} verloren`}
      width={520}
      maskClosable={false}
      onCancel={onLater}
      footer={
        <Flex justify="space-between" gap={8}>
          <Button danger disabled={busy} onClick={onDiscard}>
            Änderungen verwerfen
          </Button>
          <Flex gap={8}>
            {holder && (
              <Button disabled={busy} onClick={onLater}>
                Später
              </Button>
            )}
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
          </Flex>
        </Flex>
      }
    >
      {record && savedAt && (
        <Flex vertical gap={16}>
          <Typography.Text type="secondary">{intro}</Typography.Text>
          <LockDetails lock={holder} showUser={!own} extra={[savedAt]} />
          {warning && (
            <Alert
              type={warning.type}
              showIcon
              message={warning.message}
              description={warning.description}
            />
          )}
          {(!holder || own) && (
            <Typography.Text type="secondary">{CHANGED_HINT}</Typography.Text>
          )}
        </Flex>
      )}
    </Modal>
  );
};
