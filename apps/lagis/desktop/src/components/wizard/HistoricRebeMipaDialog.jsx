import React, { useState } from "react";
import { Checkbox, DatePicker, Modal } from "antd";
import dayjs from "dayjs";

const amount = (count, singular, plural) =>
  `${count} ${count === 1 ? singular : plural}`;

const successorPart = (count) => {
  if (!count) {
    return "keinen Nachfolger";
  }
  return count === 1 ? "einen Nachfolger" : `${count} Nachfolger`;
};

const foundPart = (rebeCount, mipaCount) => {
  const parts = [
    rebeCount > 0 && amount(rebeCount, "Recht/Belastung", "Rechte/Belastungen"),
    mipaCount > 0 &&
      amount(mipaCount, "Vermietung/Verpachtung", "Vermietungen/Verpachtungen"),
  ].filter(Boolean);
  const verb = rebeCount + mipaCount === 1 ? "liegt" : "liegen";
  return `Auf dem Flurstück ${verb} ${parts.join(" und ")}`;
};

/**
 * Port of HistoricNoSucessorDialog.
 *
 * Shown when a parcel that is being set historic still carries rights and
 * burdens or leases. Ticking a box prefills its date with the historic date,
 * exactly as the Swing checkbox listeners did.
 *
 * The Swing dialog always claimed "ohne Nachfolger" — its check is commented
 * out (LagisBroker.java:2740). Here the count decides.
 */
const HistoricRebeMipaDialog = ({
  open,
  historicDate,
  rebeCount,
  mipaCount,
  successorCount = 0,
  onApply,
  onCancel,
}) => {
  const [rebeChecked, setRebeChecked] = useState(false);
  const [mipaChecked, setMipaChecked] = useState(false);
  const [rebeDate, setRebeDate] = useState(historicDate);
  const [mipaDate, setMipaDate] = useState(historicDate);

  return (
    <Modal
      open={open}
      title={
        successorCount
          ? "Flurstück mit Nachfolger"
          : "Flurstück ohne Nachfolger"
      }
      okText="Anwenden"
      cancelText="Abbrechen"
      onOk={() =>
        onApply({
          rebeLoeschDatum: rebeChecked ? rebeDate : undefined,
          mipaVertragsendeDatum: mipaChecked ? mipaDate : undefined,
        })
      }
      onCancel={onCancel}
    >
      <div className="flex flex-col gap-3 py-2">
        <div className="text-sm text-gray-600">
          {`Das Flurstück hat ${successorPart(successorCount)}. ${foundPart(
            rebeCount,
            mipaCount
          )}.`}
        </div>
        {rebeCount > 0 && (
          <div className="flex flex-col gap-1">
            <Checkbox
              checked={rebeChecked}
              onChange={(event) => {
                setRebeChecked(event.target.checked);
                setRebeDate(event.target.checked ? historicDate : undefined);
              }}
            >
              Löschdatum für Rechte und Belastungen setzen:
            </Checkbox>
            <DatePicker
              className="ml-6"
              format="DD.MM.YYYY"
              disabled={!rebeChecked}
              value={rebeDate ? dayjs(rebeDate) : null}
              onChange={(next) => setRebeDate(next ? next.toDate() : undefined)}
            />
          </div>
        )}
        {mipaCount > 0 && (
          <div className="flex flex-col gap-1">
            <Checkbox
              checked={mipaChecked}
              onChange={(event) => {
                setMipaChecked(event.target.checked);
                setMipaDate(event.target.checked ? historicDate : undefined);
              }}
            >
              Vertragsende für Vermietungen und Verpachtungen setzen:
            </Checkbox>
            <DatePicker
              className="ml-6"
              format="DD.MM.YYYY"
              disabled={!mipaChecked}
              value={mipaDate ? dayjs(mipaDate) : null}
              onChange={(next) => setMipaDate(next ? next.toDate() : undefined)}
            />
          </div>
        )}
      </div>
    </Modal>
  );
};

export default HistoricRebeMipaDialog;
