import { Alert, Button, Collapse, Modal, Popconfirm } from "antd";
import { clientOf, describeLock, isJavaLock, isStaleLock } from "./lockText";
import type { HeldLock } from "./types";

export interface TakeOverDialogProps {
  lock: HeldLock | undefined;
  objectLabel: string;
  onTakeOver: () => void;
  onCancel: () => void;
  busy?: boolean;
  staleAfterHours?: number;
}

const warningOf = (lock: HeldLock, staleAfterHours: number) => {
  if (isJavaLock(lock)) {
    return {
      type: "error" as const,
      text: "Die Java-Anwendung prüft ihre Sperre beim Speichern nicht: Änderungen, die dort noch gespeichert werden, überschreiben Ihre. Beenden Sie dort zuerst den Bearbeitungsmodus.",
    };
  }
  if (isStaleLock(lock, staleAfterHours)) {
    return {
      type: "info" as const,
      text: `Die Sperre ist älter als ${String(
        staleAfterHours
      )} Stunden. Wahrscheinlich wurde die Bearbeitung dort nicht beendet.`,
    };
  }
  return {
    type: "warning" as const,
    text: `Wir empfehlen, in ${clientOf(
      lock
    )} weiterzuarbeiten. Bei einer Übernahme können Sie dort nicht mehr speichern.`,
  };
};

export const TakeOverDialog = ({
  lock,
  objectLabel,
  onTakeOver,
  onCancel,
  busy = false,
  staleAfterHours = 8,
}: TakeOverDialogProps) => {
  const warning = lock && warningOf(lock, staleAfterHours);
  return (
    <Modal
      open={Boolean(lock)}
      title={`${objectLabel} ist von Ihnen gesperrt`}
      maskClosable={false}
      onCancel={onCancel}
      footer={[
        <Button key="cancel" disabled={busy} onClick={onCancel}>
          Abbrechen
        </Button>,
        <Popconfirm
          key="takeOver"
          title="Bearbeitung übernehmen?"
          description={
            lock &&
            `Ungespeicherte Änderungen in ${clientOf(lock)} gehen verloren.`
          }
          okText="Übernehmen"
          cancelText="Abbrechen"
          onConfirm={onTakeOver}
        >
          <Button type="primary" loading={busy}>
            Übernehmen
          </Button>
        </Popconfirm>,
      ]}
    >
      {lock && warning && (
        <>
          <p>
            Sie bearbeiten {objectLabel} {describeLock(lock)}.
          </p>
          <Alert type={warning.type} showIcon message={warning.text} />
          {lock.history.length > 0 && (
            <Collapse
              ghost
              size="small"
              className="mt-2"
              items={[
                {
                  key: "history",
                  label: `Frühere Sperren (${String(lock.history.length)})`,
                  children: (
                    <ul className="list-disc pl-5 m-0">
                      {[...lock.history].reverse().map((old) => (
                        <li key={old.id}>{describeLock(old)}</li>
                      ))}
                    </ul>
                  ),
                },
              ]}
            />
          )}
        </>
      )}
    </Modal>
  );
};
