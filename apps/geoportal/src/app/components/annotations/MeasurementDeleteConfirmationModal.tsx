import { DeleteConfirmationModal } from "@carma-commons/ui/components";

type MeasurementDeleteConfirmationModalProps = {
  show: boolean;
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
};

export function MeasurementDeleteConfirmationModal({
  show,
  count,
  onConfirm,
  onCancel,
}: MeasurementDeleteConfirmationModalProps) {
  return (
    <DeleteConfirmationModal
      show={show}
      title={count === 1 ? "Messung löschen" : "Messungen löschen"}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      {count === 1
        ? "Möchten Sie diese Messung wirklich löschen?"
        : `Möchten Sie diese ${count} Messungen wirklich löschen?`}
    </DeleteConfirmationModal>
  );
}

export default MeasurementDeleteConfirmationModal;
