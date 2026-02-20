import { useState } from "react";
import { Form, Row, Col, Select, DatePicker } from "antd";
import { useSelector } from "react-redux";
import { getKeyTablesData } from "../../../store/slices/keyTables";

interface MastSearchProps {
  onValuesChange?: (values: SearchValues) => void;
}

interface SearchValues {
  inbetriebnahmeMast?: { von?: string; bis?: string };
  mastschutz?: { von?: string; bis?: string };
  mastanstrich?: { von?: string; bis?: string };
  elektrischePruefung?: { von?: string; bis?: string };
  standsicherheitspruefung?: { von?: string; bis?: string };
  mastart?: { value?: number };
  masttyp?: { value?: number };
  klassifizierung?: { value?: number };
  anlagengruppe?: { value?: number };
  unterhaltMast?: { value?: number };
}

interface MasttypItem {
  id: number;
  masttyp?: string;
  bezeichnung?: string;
}

interface MastartItem {
  id: number;
  pk?: string;
  mastart?: string;
}

interface KlassifizierungItem {
  id: number;
  pk?: string;
  klassifizierung?: string;
}

interface UnterhaltMastItem {
  id: number;
  pk?: string;
  unterhalt_mast?: string;
}

interface AnlagengruppeItem {
  id: number;
  nummer?: number;
  bezeichnung?: string;
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

const MastSearch = ({ onValuesChange }: MastSearchProps) => {
  const [form] = Form.useForm();
  const keyTablesData = useSelector(getKeyTablesData);

  const [values, setValues] = useState<SearchValues>({
    inbetriebnahmeMast: { von: "", bis: "" },
    mastschutz: { von: "", bis: "" },
    mastanstrich: { von: "", bis: "" },
    elektrischePruefung: { von: "", bis: "" },
    standsicherheitspruefung: { von: "", bis: "" },
    mastart: { value: undefined },
    masttyp: { value: undefined },
    klassifizierung: { value: undefined },
    anlagengruppe: { value: undefined },
    unterhaltMast: { value: undefined },
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

  // Key table options with sorting
  const masttypOptions = [
    ...((keyTablesData.masttyp || []) as MasttypItem[]),
  ].sort((a, b) => {
    const aText = `${a.masttyp || ""} ${a.bezeichnung || ""}`.trim();
    const bText = `${b.masttyp || ""} ${b.bezeichnung || ""}`.trim();
    return aText.localeCompare(bText, "de", { sensitivity: "base" });
  });

  const mastartOptions = [
    ...((keyTablesData.mastart || []) as MastartItem[]),
  ].sort((a, b) => {
    const aText = a.mastart || "";
    const bText = b.mastart || "";
    return aText.localeCompare(bText, "de", { sensitivity: "base" });
  });

  const klassifizierungOptions = [
    ...((keyTablesData.klassifizierung || []) as KlassifizierungItem[]),
  ].sort((a, b) => {
    const aText = a.klassifizierung || "";
    const bText = b.klassifizierung || "";
    return aText.localeCompare(bText, "de", { sensitivity: "base" });
  });

  const anlagengruppeOptions = [
    ...((keyTablesData.anlagengruppe || []) as AnlagengruppeItem[]),
  ].sort((a, b) => {
    const aNum = a.nummer ?? 0;
    const bNum = b.nummer ?? 0;
    return aNum - bNum;
  });

  const unterhaltMastOptions = [
    ...((keyTablesData.unterhaltMast || []) as UnterhaltMastItem[]),
  ].sort((a, b) => {
    const aText = a.unterhalt_mast || "";
    const bText = b.unterhalt_mast || "";
    return aText.localeCompare(bText, "de", { sensitivity: "base" });
  });

  return (
    <Form form={form} layout="vertical" requiredMark={false} className="pr-2">
      <SectionHeader>Zeitraum</SectionHeader>
      <DateRangeField
        label="Inbetriebnahme Mast"
        onChangeVon={(date) => updateField("inbetriebnahmeMast", { von: date })}
        onChangeBis={(date) => updateField("inbetriebnahmeMast", { bis: date })}
      />
      <DateRangeField
        label="Mastschutz"
        onChangeVon={(date) => updateField("mastschutz", { von: date })}
        onChangeBis={(date) => updateField("mastschutz", { bis: date })}
      />
      <DateRangeField
        label="Mastanstrich"
        onChangeVon={(date) => updateField("mastanstrich", { von: date })}
        onChangeBis={(date) => updateField("mastanstrich", { bis: date })}
      />
      <DateRangeField
        label="Elektrische Prüfung"
        onChangeVon={(date) =>
          updateField("elektrischePruefung", { von: date })
        }
        onChangeBis={(date) =>
          updateField("elektrischePruefung", { bis: date })
        }
      />
      <DateRangeField
        label="Standsicherheitsprüfung"
        onChangeVon={(date) =>
          updateField("standsicherheitspruefung", { von: date })
        }
        onChangeBis={(date) =>
          updateField("standsicherheitspruefung", { bis: date })
        }
      />

      <SectionHeader>Eigenschaften</SectionHeader>
      <Row gutter={24}>
        <Col span={12}>
          <Form.Item label={<FormLabel>Mastart</FormLabel>} className="mb-3">
            <Select
              placeholder="Mastart auswählen"
              className="w-full"
              allowClear
              showSearch
              optionFilterProp="children"
              onChange={(value) =>
                updateField("mastart", { value: value as number })
              }
            >
              {mastartOptions.map((item) => (
                <Select.Option key={item.id} value={item.id}>
                  {item.mastart}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item label={<FormLabel>Masttyp</FormLabel>} className="mb-3">
            <Select
              placeholder="Masttyp auswählen"
              className="w-full"
              allowClear
              showSearch
              optionFilterProp="children"
              onChange={(value) =>
                updateField("masttyp", { value: value as number })
              }
            >
              {masttypOptions.map((item) => (
                <Select.Option key={item.id} value={item.id}>
                  {item.masttyp} {item.bezeichnung}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            label={<FormLabel>Klassifizierung</FormLabel>}
            className="mb-3"
          >
            <Select
              placeholder="Klassifizierung auswählen"
              className="w-full"
              allowClear
              showSearch
              optionFilterProp="children"
              onChange={(value) =>
                updateField("klassifizierung", { value: value as number })
              }
            >
              {klassifizierungOptions.map((item) => (
                <Select.Option key={item.id} value={item.id}>
                  {item.klassifizierung}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Col>

        <Col span={12}>
          <Form.Item
            label={<FormLabel>Anlagengruppe</FormLabel>}
            className="mb-3"
          >
            <Select
              placeholder="Anlagengruppe auswählen"
              className="w-full"
              allowClear
              showSearch
              optionFilterProp="children"
              onChange={(value) =>
                updateField("anlagengruppe", { value: value as number })
              }
            >
              {anlagengruppeOptions.map((item) => (
                <Select.Option key={item.id} value={item.id}>
                  {item.nummer} - {item.bezeichnung}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            label={<FormLabel>Unterhaltspfl. Mast</FormLabel>}
            className="mb-3"
          >
            <Select
              placeholder="Unterhalt auswählen"
              className="w-full"
              allowClear
              showSearch
              optionFilterProp="children"
              onChange={(value) =>
                updateField("unterhaltMast", { value: value as number })
              }
            >
              {unterhaltMastOptions.map((item) => (
                <Select.Option key={item.id} value={item.id}>
                  {item.unterhalt_mast}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Col>
      </Row>
    </Form>
  );
};

export default MastSearch;
