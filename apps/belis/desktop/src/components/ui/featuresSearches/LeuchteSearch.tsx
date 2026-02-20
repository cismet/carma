import { useState } from "react";
import { Form, Row, Col, Select, Input, DatePicker } from "antd";
import { useSelector } from "react-redux";
import { getKeyTablesData } from "../../../store/slices/keyTables";

interface LeuchteSearchProps {
  onValuesChange?: (values: SearchValues) => void;
}

interface SearchValues {
  inbetriebnahmeLeuchte?: { von?: string; bis?: string };
  wechseldatumLeuchtmittel?: { von?: string; bis?: string };
  naechsterLeuchtmittelwechsel?: { von?: string; bis?: string };
  leuchtentyp?: { value?: number };
  rundsteuerempfaenger?: { value?: number };
  schaltstelle?: { value?: string };
  dk1?: { value?: number };
  dk2?: { value?: number };
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

const FormLabel = ({ children }: { children: React.ReactNode }) => (
  <span className="text-sm font-medium text-gray-700">{children}</span>
);

const SectionHeader = ({ children }: { children: React.ReactNode }) => (
  <div className="mb-1 mt-3 first:mt-0">
    <span className="text-sm font-medium text-gray-500">{children}</span>
  </div>
);

interface DateRangeFieldProps {
  label: string;
  onChangeVon: (date: string | undefined) => void;
  onChangeBis: (date: string | undefined) => void;
}

const DateRangeField = ({
  label,
  onChangeVon,
  onChangeBis,
}: DateRangeFieldProps) => (
  <div className="mb-3">
    <FormLabel>{label}</FormLabel>
    <Row gutter={12} className="mt-1">
      <Col span={12}>
        <DatePicker
          className="w-full"
          format="DD.MM.YYYY"
          placeholder="von"
          onChange={(date) => onChangeVon(date?.format("YYYY-MM-DD"))}
        />
      </Col>
      <Col span={12}>
        <DatePicker
          className="w-full"
          format="DD.MM.YYYY"
          placeholder="bis"
          onChange={(date) => onChangeBis(date?.format("YYYY-MM-DD"))}
        />
      </Col>
    </Row>
  </div>
);

const LeuchteSearch = ({ onValuesChange }: LeuchteSearchProps) => {
  const [form] = Form.useForm();
  const keyTablesData = useSelector(getKeyTablesData);

  const [values, setValues] = useState<SearchValues>({
    inbetriebnahmeLeuchte: { von: "", bis: "" },
    wechseldatumLeuchtmittel: { von: "", bis: "" },
    naechsterLeuchtmittelwechsel: { von: "", bis: "" },
    leuchtentyp: { value: undefined },
    rundsteuerempfaenger: { value: undefined },
    schaltstelle: { value: "" },
    dk1: { value: undefined },
    dk2: { value: undefined },
  });

  const updateField = (
    field: keyof SearchValues,
    updates: Partial<SearchValues[keyof SearchValues]>
  ) => {
    const newValues = {
      ...values,
      [field]: { ...values[field], ...updates },
    };
    setValues(newValues);
    onValuesChange?.(newValues);
  };

  // Key table options with sorting (matching keyTableDisplayConfig)
  const leuchttypOptions = [
    ...((keyTablesData.leuchtentyp || []) as LeuchttypItem[]),
  ].sort((a, b) => {
    const aText = `${a.leuchtentyp || ""} ${a.fabrikat || ""}`.trim();
    const bText = `${b.leuchtentyp || ""} ${b.fabrikat || ""}`.trim();
    return aText.localeCompare(bText, "de", { sensitivity: "base" });
  });

  const rundsteuerempfaengerOptions = [
    ...((keyTablesData["rundsteuerempfänger"] ||
      []) as RundsteuerempfaengerItem[]),
  ].sort((a, b) => {
    const aText = a.rs_typ || "";
    const bText = b.rs_typ || "";
    return aText.localeCompare(bText, "de", { sensitivity: "base" });
  });

  const doppelkommandoOptions = [
    ...((keyTablesData.doppelkommando || []) as DoppelkommandoItem[]),
  ].sort((a, b) => {
    const aText = `${a.pk || ""} - ${a.beschreibung || ""}`.trim();
    const bText = `${b.pk || ""} - ${b.beschreibung || ""}`.trim();
    return aText.localeCompare(bText, "de", { numeric: true });
  });

  return (
    <Form form={form} layout="vertical" requiredMark={false} className="pr-2">
      <SectionHeader>Zeitraum</SectionHeader>
      <DateRangeField
        label="Inbetriebnahme"
        onChangeVon={(date) =>
          updateField("inbetriebnahmeLeuchte", { von: date })
        }
        onChangeBis={(date) =>
          updateField("inbetriebnahmeLeuchte", { bis: date })
        }
      />
      <DateRangeField
        label="Wechseldatum"
        onChangeVon={(date) =>
          updateField("wechseldatumLeuchtmittel", { von: date })
        }
        onChangeBis={(date) =>
          updateField("wechseldatumLeuchtmittel", { bis: date })
        }
      />
      <DateRangeField
        label="Nächster Wechsel"
        onChangeVon={(date) =>
          updateField("naechsterLeuchtmittelwechsel", { von: date })
        }
        onChangeBis={(date) =>
          updateField("naechsterLeuchtmittelwechsel", { bis: date })
        }
      />

      <SectionHeader>Eigenschaften</SectionHeader>
      <Form.Item label={<FormLabel>Leuchtentyp</FormLabel>} className="mb-3">
        <Select
          placeholder="Leuchtentyp auswählen"
          className="w-full"
          allowClear
          showSearch
          optionFilterProp="children"
          onChange={(value) =>
            updateField("leuchtentyp", { value: value as number })
          }
        >
          {leuchttypOptions.map((item) => (
            <Select.Option key={item.id} value={item.id}>
              {item.leuchtentyp} {item.fabrikat}
            </Select.Option>
          ))}
        </Select>
      </Form.Item>

      <Row gutter={12}>
        <Col span={12}>
          <Form.Item
            label={<FormLabel>Schaltstelle</FormLabel>}
            className="mb-3"
          >
            <Input
              placeholder="eingeben"
              onChange={(e) =>
                updateField("schaltstelle", { value: e.target.value })
              }
            />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            label={<FormLabel>Rundsteuerempf.</FormLabel>}
            className="mb-3"
          >
            <Select
              placeholder="auswählen"
              className="w-full"
              allowClear
              showSearch
              optionFilterProp="children"
              onChange={(value) =>
                updateField("rundsteuerempfaenger", { value: value as number })
              }
            >
              {rundsteuerempfaengerOptions.map((item) => (
                <Select.Option key={item.id} value={item.id}>
                  {item.rs_typ}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Col>
      </Row>

      <SectionHeader>Doppelkommando</SectionHeader>
      <Row gutter={24}>
        <Col span={12}>
          <Form.Item label={<FormLabel>DK 1</FormLabel>} className="mb-3">
            <Select
              placeholder="Auswählen"
              className="w-full"
              allowClear
              showSearch
              optionFilterProp="children"
              onChange={(value) =>
                updateField("dk1", { value: value as number })
              }
            >
              {doppelkommandoOptions.map((item) => (
                <Select.Option key={item.id} value={item.id}>
                  {item.pk} - {item.beschreibung}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item label={<FormLabel>DK 2</FormLabel>} className="mb-3">
            <Select
              placeholder="Auswählen"
              className="w-full"
              allowClear
              showSearch
              optionFilterProp="children"
              onChange={(value) =>
                updateField("dk2", { value: value as number })
              }
            >
              {doppelkommandoOptions.map((item) => (
                <Select.Option key={item.id} value={item.id}>
                  {item.pk} - {item.beschreibung}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Col>
      </Row>
    </Form>
  );
};

export default LeuchteSearch;
