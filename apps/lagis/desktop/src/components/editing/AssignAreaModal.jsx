import React, { useEffect, useState } from "react";
import { Modal, Select } from "antd";

const formatArea = (area) =>
  `${Number(area).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} m²`;

// Like Java's "Geometrie zuordnen": only rows without an area are offered
const AssignAreaModal = ({ dialog }) => {
  const [rowId, setRowId] = useState();
  const options = dialog?.options ?? [];

  useEffect(() => {
    setRowId(options.length === 1 ? options[0].value : undefined);
  }, [dialog?.area, options.length]);

  return (
    <Modal
      open={Boolean(dialog)}
      title="Polygon zuordnen"
      okText="Zuordnen"
      cancelText="Abbrechen"
      okButtonProps={{ disabled: !rowId }}
      onOk={() => dialog.onAssign(rowId)}
      onCancel={() => dialog?.onCancel()}
      destroyOnClose
    >
      {options.length === 0 ? (
        <p>
          Es ist keine Dienststelle ohne Fläche vorhanden. Legen Sie eine neue
          Zeile an oder heben Sie eine Zuordnung auf.
        </p>
      ) : (
        <>
          <p>
            Bitte wählen Sie die Dienststelle, der die Fläche (
            {dialog && formatArea(dialog.area)}) zugeordnet werden soll:
          </p>
          <Select
            className="w-full"
            showSearch
            optionFilterProp="label"
            placeholder="Dienststelle wählen"
            value={rowId}
            onChange={setRowId}
            options={options}
          />
        </>
      )}
    </Modal>
  );
};

export default AssignAreaModal;
