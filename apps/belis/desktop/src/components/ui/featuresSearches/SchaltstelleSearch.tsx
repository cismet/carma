import { useState } from "react";
import { Form, Row, Col, Select, DatePicker } from "antd";
import { useSelector } from "react-redux";
import { getKeyTablesData } from "../../../store/slices/keyTables";

interface SchaltstelleSearchProps {
  onValuesChange?: (values: SearchValues) => void;
}

interface SearchValues {
  bauart?: { value?: number };
  erstellungsjahr?: { von?: string; bis?: string };
  rundsteuerempfaenger?: { value?: number };
  einbaudatumRs?: { von?: string; bis?: string };
  pruefdatum?: { von?: string; bis?: string };
}

interface BauartItem {
  id: number;
  bezeichnung?: string;
}

interface RundsteuerempfaengerItem {
  id: number;
  rs_typ?: string;
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

const SchaltstelleSearch = ({ onValuesChange }: SchaltstelleSearchProps) => {
  const [form] = Form.useForm();
  const keyTablesData = useSelector(getKeyTablesData);

  const [values, setValues] = useState<SearchValues>({
    bauart: { value: undefined },
    erstellungsjahr: { von: "", bis: "" },
    rundsteuerempfaenger: { value: undefined },
    einbaudatumRs: { von: "", bis: "" },
    pruefdatum: { von: "", bis: "" },
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
  const bauartOptions = [
    ...((keyTablesData.bauart || []) as BauartItem[]),
  ].sort((a, b) => {
    const aText = a.bezeichnung || "";
    const bText = b.bezeichnung || "";
    return aText.localeCompare(bText, "de", { sensitivity: "base" });
  });

  const rundsteuerempfaengerOptions = [
    ...((keyTablesData["rundsteuerempfänger"] || []) as RundsteuerempfaengerItem[]),
  ].sort((a, b) => {
    const aText = a.rs_typ || "";
    const bText = b.rs_typ || "";
    return aText.localeCompare(bText, "de", { sensitivity: "base" });
  });

  return (
    <Form form={form} layout="vertical" requiredMark={false} className="pr-2">
      <SectionHeader>Zeitraum</SectionHeader>
      <DateRangeField
        label="Erstellungsjahr"
        onChangeVon={(date) => updateField("erstellungsjahr", { von: date })}
        onChangeBis={(date) => updateField("erstellungsjahr", { bis: date })}
      />
      <DateRangeField
        label="Einbaudatum"
        onChangeVon={(date) => updateField("einbaudatumRs", { von: date })}
        onChangeBis={(date) => updateField("einbaudatumRs", { bis: date })}
      />
      <DateRangeField
        label="Prüfung"
        onChangeVon={(date) => updateField("pruefdatum", { von: date })}
        onChangeBis={(date) => updateField("pruefdatum", { bis: date })}
      />

      <SectionHeader>Eigenschaften</SectionHeader>
      <Row gutter={24}>
        <Col span={12}>
          <Form.Item label={<FormLabel>Bauart</FormLabel>} className="mb-3">
            <Select
              placeholder="Bauart auswählen"
              className="w-full"
              allowClear
              showSearch
              optionFilterProp="children"
              onChange={(value) =>
                updateField("bauart", { value: value as number })
              }
            >
              {bauartOptions.map((item) => (
                <Select.Option key={item.id} value={item.id}>
                  {item.bezeichnung}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item label={<FormLabel>Rundsteuerempf.</FormLabel>} className="mb-3">
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
    </Form>
  );
};

export default SchaltstelleSearch;
