import { type KeyboardEvent, type ReactNode } from "react";
import { Button, Modal, type ButtonProps } from "react-bootstrap";

export type DeleteConfirmationModalProps = {
  show: boolean;
  title: ReactNode;
  children: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: ButtonProps["variant"];
  zIndex?: number;
  dialogTestId?: string;
  confirmTestId?: string;
};

export function DeleteConfirmationModal({
  show,
  title,
  children,
  onConfirm,
  onCancel,
  confirmLabel = "Löschen",
  cancelLabel = "Abbrechen",
  confirmVariant = "danger",
  zIndex = 2900000000,
  dialogTestId,
  confirmTestId,
}: DeleteConfirmationModalProps) {
  return (
    <Modal
      show={show}
      onHide={onCancel}
      style={{ zIndex }}
      onKeyDown={(event: KeyboardEvent) => event.stopPropagation()}
      data-test-id={dialogTestId}
    >
      <Modal.Header closeButton>
        <Modal.Title>{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>{children}</Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button
          variant={confirmVariant}
          onClick={onConfirm}
          data-test-id={confirmTestId}
        >
          {confirmLabel}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export default DeleteConfirmationModal;
