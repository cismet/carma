import { Button, Modal } from "antd";
import type { DraftRecord } from "./draftStore";

export interface ResumeDraftDialogProps {
  record: DraftRecord | undefined;
  objectLabel: string;
  onResume: () => void;
  onDiscard: () => void;
  busy?: boolean;
}

const formatSavedAt = (iso: string) =>
  new Date(iso).toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  });

export const ResumeDraftDialog = ({
  record,
  objectLabel,
  onResume,
  onDiscard,
  busy = false,
}: ResumeDraftDialogProps) => (
  <Modal
    open={Boolean(record)}
    title={`Ungespeicherte Änderungen an ${objectLabel}`}
    closable={false}
    maskClosable={false}
    keyboard={false}
    footer={[
      <Button key="discard" danger disabled={busy} onClick={onDiscard}>
        Verwerfen
      </Button>,
      <Button key="resume" type="primary" loading={busy} onClick={onResume}>
        Weiterarbeiten
      </Button>,
    ]}
  >
    {record && (
      <p>
        Sie haben {objectLabel} am {formatSavedAt(record.savedAt)} in{" "}
        {record.client} bearbeitet und nicht gespeichert. Das Objekt ist noch
        für Sie gesperrt.
      </p>
    )}
    <p className="text-gray-600">
      Wir empfehlen, mit diesem Entwurf weiterzuarbeiten. „Verwerfen“ löscht die
      Änderungen und gibt die Sperre frei.
    </p>
  </Modal>
);
