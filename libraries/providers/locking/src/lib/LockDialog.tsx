import { Alert, Flex, Modal } from "antd";
import type { ReactNode } from "react";

export interface LockNote {
  type: "error" | "warning" | "info";
  message: string;
  description?: string;
}

export interface LockDialogProps {
  open: boolean;
  title: string;
  details: ReactNode;
  note?: LockNote | undefined;
  actions: ReactNode;
  // without onCancel the dialog can only be left through its buttons
  onCancel?: () => void;
}

// Shared layout of all lock dialogs: title, details box, one note, buttons.
export const LockDialog = ({
  open,
  title,
  details,
  note,
  actions,
  onCancel,
}: LockDialogProps) => (
  <Modal
    open={open}
    title={title}
    width={520}
    maskClosable={false}
    closable={Boolean(onCancel)}
    keyboard={Boolean(onCancel)}
    onCancel={onCancel}
    footer={
      <Flex justify="end" gap={8}>
        {actions}
      </Flex>
    }
  >
    {open && <LockDialogBody details={details} note={note} />}
  </Modal>
);

export const LockDialogBody = ({
  details,
  note,
}: {
  details: ReactNode;
  note?: LockNote | undefined;
}) => (
  <Flex vertical gap={8}>
    {details}
    {note && (
      <Alert
        type={note.type}
        showIcon
        message={<span style={{ whiteSpace: "pre-line" }}>{note.message}</span>}
        description={note.description}
      />
    )}
  </Flex>
);
