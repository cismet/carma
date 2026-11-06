import React from "react";
import { Button, Modal } from "antd";

// Java NKFRemoveNutzungDialog, shown only with NKF admin rights
const RemoveUsageDialog = ({ open, onCancel, onWithoutHistory, onHistory }) => (
  <Modal
    open={open}
    title="Buchung löschen?"
    onCancel={onCancel}
    footer={[
      <Button key="cancel" onClick={onCancel}>
        Abbrechen
      </Button>,
      <Button key="without" danger onClick={onWithoutHistory}>
        ohne Historie
      </Button>,
      <Button key="history" type="primary" onClick={onHistory}>
        Historie anlegen
      </Button>,
    ]}
  >
    Wollen Sie die Buchung löschen? Ohne Historie wird die aktuelle Buchung
    gelöscht und die vorherige wieder gültig; hat die Nutzung nur eine Buchung,
    wird sie ganz gelöscht. Mit Historie wird die Nutzung historisch gesetzt.
  </Modal>
);

export default RemoveUsageDialog;
