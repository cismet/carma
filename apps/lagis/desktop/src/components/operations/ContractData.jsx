import { useState, useEffect } from "react";
import { Col, DatePicker, Divider, Form, Input, Row } from "antd";
import dayjs from "dayjs";
import InfoBlock from "../ui/Blocks/InfoBlock";
import ContractForm from "../ui/forms/ContractForm";
import { vorgange } from "@carma-collab/wuppertal/lagis-desktop";
import { EDIT_DAY, VIEW_DAY } from "../editing/columns";
import { vertragspartnerLabel } from "../../core/editing/vertrag";
import useActiveVertrag from "./useActiveVertrag";

// same layout as the view's ContractForm, so the block doesn't jump on edit
const FIELD_CLASS = "mt-4 mb-4 text-xs";
const Label = ({ text }) => (
  <span style={{ fontSize: "14px", marginBottom: "8px" }}>{text}</span>
);

const DayPicker = ({ day, onChange }) => (
  <DatePicker
    format={VIEW_DAY}
    className="w-full"
    getPopupContainer={() => document.body}
    value={day ? dayjs(day) : null}
    onChange={(next) => onChange(next ? next.format(EDIT_DAY) : null)}
  />
);

const VertragForm = ({ vertrag, update }) => (
  <div className="overflow-auto">
    <Form layout="vertical" style={{ padding: "0 12px" }}>
      <Row gutter={24}>
        <Col span={12}>
          <Form.Item
            label={<Label text={vertragspartnerLabel(vertrag.artId)} />}
            className={FIELD_CLASS}
          >
            <Input
              value={vertrag.vertragspartner}
              onChange={(event) =>
                update({ vertragspartner: event.target.value })
              }
            />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            label={<Label text={vorgange.vertragsdaten.auflassungLabel} />}
            className={FIELD_CLASS}
          >
            <DayPicker
              day={vertrag.auflassung}
              onChange={(auflassung) => update({ auflassung })}
            />
          </Form.Item>
        </Col>
        <Divider style={{ margin: 0 }} />
      </Row>
      <Form.Item
        label={<Label text={vorgange.vertragsdaten.eintragungLabel} />}
        className={FIELD_CLASS}
      >
        <DayPicker
          day={vertrag.eintragung}
          onChange={(eintragung) => update({ eintragung })}
        />
      </Form.Item>
      <Divider style={{ margin: 0 }} />
      <Form.Item
        label={<Label text={vorgange.vertragsdaten.bemerkung} />}
        className={FIELD_CLASS}
      >
        <Input.TextArea
          rows={5}
          style={{ resize: "none" }}
          value={vertrag.bemerkung}
          onChange={(event) => update({ bemerkung: event.target.value })}
        />
      </Form.Item>
    </Form>
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
