import React from "react";
import { useSelector } from "react-redux";
import { Button, Modal } from "antd";
import { getEditParcel, getEditStatus } from "../../store/slices/editing";

const parcelName = (key) =>
  `${key.gemarkung?.bezeichnung}-${key.flur}-${key.zaehler}/${key.nenner ?? 0}`;

// the one dialog for leaving or saving unsaved edits
const UnsavedChangesDialog = ({
  open,
  title = "Bearbeitungsmodus beenden",
  onCancel,
  onDiscard,
  onSave,
}) => {
  const parcel = useSelector(getEditParcel);
  const busy = useSelector(getEditStatus) !== "idle";

  return (
    <Modal
      open={open}
      title={title}
      onCancel={onCancel}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          Abbrechen
        </Button>,
        <Button key="discard" danger disabled={busy} onClick={onDiscard}>
          Verwerfen
        </Button>,
        <Button key="save" type="primary" disabled={busy} onClick={onSave}>
          Speichern
        </Button>,
      ]}
    >
      Es gibt ungespeicherte Änderungen an{" "}
      {parcel?.key ? parcelName(parcel.key) : parcel?.label}. Sollen sie
      gespeichert oder verworfen werden?
    </Modal>
  );
};

export default UnsavedChangesDialog;
