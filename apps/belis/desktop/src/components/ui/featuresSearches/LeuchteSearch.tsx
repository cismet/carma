import React, { useState } from "react";
import { Form, Row, Col } from "react-bootstrap";
import { useSelector } from "react-redux";
import { getKeyTablesData } from "../../../store/slices/keyTables";

interface LeuchteSearchProps {
  onValuesChange?: (values: SearchValues) => void;
}

interface SearchValues {
  inbetriebnahmeLeuchte?: { enabled: boolean; von?: string; bisEnabled?: boolean; bis?: string };
  wechseldatumLeuchtmittel?: { enabled: boolean; von?: string; bisEnabled?: boolean; bis?: string };
  naechsterLeuchtmittelwechsel?: { enabled: boolean; von?: string; bisEnabled?: boolean; bis?: string };
  leuchtentyp?: { enabled: boolean; value?: number };
  rundsteuerempfaenger?: { enabled: boolean; value?: number };
  schaltstelle?: { enabled: boolean; value?: string };
  dk1?: { enabled: boolean; value?: number };
  dk2?: { enabled: boolean; value?: number };
}

interface LeuchttypItem {
  id: number;
  leuchtentyp?: string;
  fabrikat?: string;
}

interface RundsteuerempfaengerItem {
  id: number;
  rs_typ?: string;
}

interface DoppelkommandoItem {
  id: number;
  pk?: string;
  beschreibung?: string;
}

// Date range field with checkbox
const DateRangeField = ({
  label,
  enabled,
  onEnabledChange,
  vonValue,
  onVonChange,
  bisEnabled,
  onBisEnabledChange,
  bisValue,
  onBisChange,
}: {
  label: string;
  enabled: boolean;
  onEnabledChange: (checked: boolean) => void;
  vonValue: string;
  onVonChange: (value: string) => void;
  bisEnabled: boolean;
  onBisEnabledChange: (checked: boolean) => void;
  bisValue: string;
  onBisChange: (value: string) => void;
}) => (
  <fieldset
    style={{
      border: "1px solid #ccc",
      padding: "8px 12px",
      marginBottom: "8px",
      borderRadius: "3px",
    }}
  >
    <legend
      style={{
        fontSize: "12px",
        color: "#666",
        width: "auto",
        padding: "0 4px",
        marginBottom: "0",
      }}
    >
      {label}
    </legend>
    <Row className="align-items-center g-2">
      <Col xs="auto">
        <Form.Check
          type="checkbox"
          checked={enabled}
          onChange={(e) => onEnabledChange(e.target.checked)}
        />
      </Col>
      <Col xs="auto">
        <span style={{ fontSize: "12px", color: "#666" }}>von:</span>
      </Col>
      <Col>
        <Form.Control
          type="date"
          size="sm"
          disabled={!enabled}
          value={vonValue}
          onChange={(e) => onVonChange(e.target.value)}
        />
      </Col>
      <Col xs="auto">
        <span style={{ color: "#999" }}>=</span>
      </Col>
      <Col xs="auto">
        <Form.Check
          type="checkbox"
          checked={bisEnabled}
          disabled={!enabled}
          onChange={(e) => onBisEnabledChange(e.target.checked)}
        />
      </Col>
      <Col xs="auto">
        <span style={{ fontSize: "12px", color: "#666" }}>bis:</span>
      </Col>
      <Col>
        <Form.Control
          type="date"
          size="sm"
          disabled={!enabled}
          value={bisValue}
          onChange={(e) => onBisChange(e.target.value)}
        />
      </Col>
    </Row>
  </fieldset>
);

// Select field with checkbox
const SelectField = ({
  label,
  enabled,
  onEnabledChange,
  value,
  onChange,
  options,
}: {
  label: string;
  enabled: boolean;
  onEnabledChange: (checked: boolean) => void;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string | number; label: string }>;
}) => (
  <fieldset
    style={{
      border: "1px solid #ccc",
      padding: "8px 12px",
      marginBottom: "8px",
      borderRadius: "3px",
    }}
  >
    <legend
      style={{
        fontSize: "12px",
        color: "#666",
        width: "auto",
        padding: "0 4px",
        marginBottom: "0",
      }}
    >
      {label}
    </legend>
    <Row className="align-items-center g-2">
      <Col xs="auto">
        <Form.Check
          type="checkbox"
          checked={enabled}
          onChange={(e) => onEnabledChange(e.target.checked)}
        />
      </Col>
      <Col>
        <Form.Control
          as="select"
          size="sm"
          disabled={!enabled}
          value={value}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
        >
          <option value=""></option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Form.Control>
      </Col>
    </Row>
  </fieldset>
);

// Text input field with checkbox
const TextInputField = ({
  label,
  enabled,
  onEnabledChange,
  value,
  onChange,
}: {
  label: string;
  enabled: boolean;
  onEnabledChange: (checked: boolean) => void;
  value: string;
  onChange: (value: string) => void;
}) => (
  <fieldset
    style={{
      border: "1px solid #ccc",
      padding: "8px 12px",
      marginBottom: "8px",
      borderRadius: "3px",
    }}
  >
    <legend
      style={{
        fontSize: "12px",
        color: "#666",
        width: "auto",
        padding: "0 4px",
        marginBottom: "0",
      }}
    >
      {label}
    </legend>
    <Row className="align-items-center g-2">
      <Col xs="auto">
        <Form.Check
          type="checkbox"
          checked={enabled}
          onChange={(e) => onEnabledChange(e.target.checked)}
        />
      </Col>
      <Col>
        <Form.Control
          type="text"
          size="sm"
          disabled={!enabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </Col>
    </Row>
  </fieldset>
);

const LeuchteSearch = ({ onValuesChange }: LeuchteSearchProps) => {
  const keyTablesData = useSelector(getKeyTablesData);

  // State for all form fields
  const [values, setValues] = useState<SearchValues>({
    inbetriebnahmeLeuchte: { enabled: false, von: "", bisEnabled: false, bis: "" },
    wechseldatumLeuchtmittel: { enabled: false, von: "", bisEnabled: false, bis: "" },
    naechsterLeuchtmittelwechsel: { enabled: false, von: "", bisEnabled: false, bis: "" },
    leuchtentyp: { enabled: false, value: undefined },
    rundsteuerempfaenger: { enabled: false, value: undefined },
    schaltstelle: { enabled: false, value: "" },
    dk1: { enabled: false, value: undefined },
    dk2: { enabled: false, value: undefined },
  });

  const updateField = (field: keyof SearchValues, updates: Partial<SearchValues[keyof SearchValues]>) => {
    const newValues = {
      ...values,
      [field]: { ...values[field], ...updates },
    };
    setValues(newValues);
    onValuesChange?.(newValues);
  };

  // Key table options
  const leuchttypOptions = ((keyTablesData.leuchtentyp || []) as LeuchttypItem[]).map((item) => ({
    value: item.id,
    label: `${item.leuchtentyp || ""} ${item.fabrikat || ""}`.trim(),
  }));

  const rundsteuerempfaengerOptions = ((keyTablesData["rundsteuerempfänger"] || []) as RundsteuerempfaengerItem[]).map(
    (item) => ({
      value: item.id,
      label: item.rs_typ || "",
    })
  );

  const doppelkommandoOptions = ((keyTablesData.doppelkommando || []) as DoppelkommandoItem[]).map((item) => ({
    value: item.id,
    label: `${item.pk || ""} - ${item.beschreibung || ""}`.trim(),
  }));

  return (
    <div style={{ padding: "4px" }}>
      <DateRangeField
        label="Inbetriebnahme Leuchte"
        enabled={values.inbetriebnahmeLeuchte?.enabled || false}
        onEnabledChange={(checked) => updateField("inbetriebnahmeLeuchte", { enabled: checked })}
        vonValue={values.inbetriebnahmeLeuchte?.von || ""}
        onVonChange={(v) => updateField("inbetriebnahmeLeuchte", { von: v })}
        bisEnabled={values.inbetriebnahmeLeuchte?.bisEnabled || false}
        onBisEnabledChange={(checked) => updateField("inbetriebnahmeLeuchte", { bisEnabled: checked })}
        bisValue={values.inbetriebnahmeLeuchte?.bis || ""}
        onBisChange={(v) => updateField("inbetriebnahmeLeuchte", { bis: v })}
      />

      <DateRangeField
        label="Wechseldatum Leuchtmittel"
        enabled={values.wechseldatumLeuchtmittel?.enabled || false}
        onEnabledChange={(checked) => updateField("wechseldatumLeuchtmittel", { enabled: checked })}
        vonValue={values.wechseldatumLeuchtmittel?.von || ""}
        onVonChange={(v) => updateField("wechseldatumLeuchtmittel", { von: v })}
        bisEnabled={values.wechseldatumLeuchtmittel?.bisEnabled || false}
        onBisEnabledChange={(checked) => updateField("wechseldatumLeuchtmittel", { bisEnabled: checked })}
        bisValue={values.wechseldatumLeuchtmittel?.bis || ""}
        onBisChange={(v) => updateField("wechseldatumLeuchtmittel", { bis: v })}
      />

      <DateRangeField
        label="Nächster Leuchtmittelwechsel"
        enabled={values.naechsterLeuchtmittelwechsel?.enabled || false}
        onEnabledChange={(checked) => updateField("naechsterLeuchtmittelwechsel", { enabled: checked })}
        vonValue={values.naechsterLeuchtmittelwechsel?.von || ""}
        onVonChange={(v) => updateField("naechsterLeuchtmittelwechsel", { von: v })}
        bisEnabled={values.naechsterLeuchtmittelwechsel?.bisEnabled || false}
        onBisEnabledChange={(checked) => updateField("naechsterLeuchtmittelwechsel", { bisEnabled: checked })}
        bisValue={values.naechsterLeuchtmittelwechsel?.bis || ""}
        onBisChange={(v) => updateField("naechsterLeuchtmittelwechsel", { bis: v })}
      />

      <SelectField
        label="Leuchtentyp"
        enabled={values.leuchtentyp?.enabled || false}
        onEnabledChange={(checked) => updateField("leuchtentyp", { enabled: checked })}
        value={values.leuchtentyp?.value?.toString() || ""}
        onChange={(v) => updateField("leuchtentyp", { value: v ? Number(v) : undefined })}
        options={leuchttypOptions}
      />

      <SelectField
        label="Rundsteuerempfänger"
        enabled={values.rundsteuerempfaenger?.enabled || false}
        onEnabledChange={(checked) => updateField("rundsteuerempfaenger", { enabled: checked })}
        value={values.rundsteuerempfaenger?.value?.toString() || ""}
        onChange={(v) => updateField("rundsteuerempfaenger", { value: v ? Number(v) : undefined })}
        options={rundsteuerempfaengerOptions}
      />

      <TextInputField
        label="Schaltstelle"
        enabled={values.schaltstelle?.enabled || false}
        onEnabledChange={(checked) => updateField("schaltstelle", { enabled: checked })}
        value={values.schaltstelle?.value || ""}
        onChange={(v) => updateField("schaltstelle", { value: v })}
      />

      <SelectField
        label="1 DK"
        enabled={values.dk1?.enabled || false}
        onEnabledChange={(checked) => updateField("dk1", { enabled: checked })}
        value={values.dk1?.value?.toString() || ""}
        onChange={(v) => updateField("dk1", { value: v ? Number(v) : undefined })}
        options={doppelkommandoOptions}
      />

      <SelectField
        label="2DK"
        enabled={values.dk2?.enabled || false}
        onEnabledChange={(checked) => updateField("dk2", { enabled: checked })}
        value={values.dk2?.value?.toString() || ""}
        onChange={(v) => updateField("dk2", { value: v ? Number(v) : undefined })}
        options={doppelkommandoOptions}
      />
    </div>
  );
};

export default LeuchteSearch;
