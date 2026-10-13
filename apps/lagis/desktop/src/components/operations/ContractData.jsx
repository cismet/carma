import { useState, useEffect } from "react";
import { DatePicker, Input } from "antd";
import dayjs from "dayjs";
import InfoBlock from "../ui/Blocks/InfoBlock";
import ContractForm from "../ui/forms/ContractForm";
import { vorgange } from "@carma-collab/wuppertal/lagis-desktop";
import { EDIT_DAY, VIEW_DAY } from "../editing/columns";
import { vertragspartnerLabel } from "../../core/editing/vertrag";
import useActiveVertrag from "./useActiveVertrag";

const Field = ({ label, children }) => (
  <label className="flex flex-col gap-2 text-sm">
    <span>{label}</span>
    {children}
  </label>
);

const DayField = ({ label, day, onChange }) => (
  <Field label={label}>
    <DatePicker
      format={VIEW_DAY}
      className="w-full"
      getPopupContainer={() => document.body}
      value={day ? dayjs(day) : null}
      onChange={(next) => onChange(next ? next.format(EDIT_DAY) : null)}
    />
  </Field>
);

const VertragForm = ({ vertrag, update }) => (
  <div className="flex flex-col gap-4 overflow-auto px-3 pb-3">
    <div className="grid grid-cols-2 gap-4">
      <Field label={vertragspartnerLabel(vertrag.artId)}>
        <Input
          value={vertrag.vertragspartner}
          onChange={(event) => update({ vertragspartner: event.target.value })}
        />
      </Field>
      <DayField
        label={vorgange.vertragsdaten.auflassungLabel}
        day={vertrag.auflassung}
        onChange={(auflassung) => update({ auflassung })}
      />
    </div>
    <DayField
      label={vorgange.vertragsdaten.eintragungLabel}
      day={vertrag.eintragung}
      onChange={(eintragung) => update({ eintragung })}
    />
    <Field label={vorgange.vertragsdaten.bemerkung}>
      <Input.TextArea
        rows={5}
        style={{ resize: "none" }}
        value={vertrag.bemerkung}
        onChange={(event) => update({ bemerkung: event.target.value })}
      />
    </Field>
  </div>
);

// editSelectedId: the draft Vertrag picked in the Vorgänge table
const ContractData = ({ dataIn, extractor, activeDataId, editSelectedId }) => {
  const [contracts, setContracts] = useState([]);
  const [activeRow, setActiveRow] = useState();
  const { editable, vertrag, update } = useActiveVertrag(editSelectedId);
  useEffect(() => {
    const data = extractor(dataIn);
    setContracts(data);
    setActiveRow(data[0]);
  }, [dataIn]);
  useEffect(() => {
    if (activeDataId) {
      const activeRowData = contracts.filter((c) => c.id === activeDataId);
      setActiveRow(activeRowData[0]);
    }
  }, [activeDataId]);

  return (
    <div className="contract-data h-full w-full shadow-md">
      <InfoBlock title={vorgange.vertragsdaten.title}>
        {!editable ? (
          <ContractForm activeRow={activeRow} />
        ) : vertrag ? (
          <VertragForm vertrag={vertrag} update={update} />
        ) : null}
      </InfoBlock>
    </div>
  );
};

export default ContractData;
