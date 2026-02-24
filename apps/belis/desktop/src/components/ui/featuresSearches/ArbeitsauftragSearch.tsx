import { useState } from "react";
import { Form, Row, Col, Select, Input, DatePicker } from "antd";
import { useSelector } from "react-redux";
import { getKeyTablesData } from "../../../store/slices/keyTables";

interface ArbeitsauftragSearchProps {
  onValuesChange?: (values: SearchValues) => void;
}

interface SearchValues {
  bearbeitungsstand?: { value?: string };
  auftragsnummer?: { value?: string };
  zugewiesenAn?: { value?: number };
  angelegtAm?: { von?: string; bis?: string };
  angelegtVon?: { value?: string };
}

interface TeamItem {
  id: number;
  name?: string;
}

const bearbeitungsstandOptions = [
  { value: "alle", label: "alle" },
  { value: "offen", label: "nur offene" },
  { value: "abgearbeitet", label: "nur abgearbeitete" },
];

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

const ArbeitsauftragSearch = ({ onValuesChange }: ArbeitsauftragSearchProps) => {
  const [form] = Form.useForm();
  const keyTablesData = useSelector(getKeyTablesData);

  const [values, setValues] = useState<SearchValues>({
    bearbeitungsstand: { value: undefined },
    auftragsnummer: { value: "" },
    zugewiesenAn: { value: undefined },
    angelegtAm: { von: "", bis: "" },
    angelegtVon: { value: "" },
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
  const teamOptions = [
    ...((keyTablesData.teams || []) as TeamItem[]),
  ].sort((a, b) => {
    const aText = a.name || "";
    const bText = b.name || "";
    return aText.localeCompare(bText, "de", { sensitivity: "base" });
  });

  return (
    <Form form={form} layout="vertical" requiredMark={false} className="pr-2">
      <SectionHeader>Status</SectionHeader>
      <Form.Item label={<FormLabel>Bearbeitungsstand</FormLabel>} className="mb-3">
        <Select
          defaultValue="alle"
          className="w-full"
          onChange={(value) =>
            updateField("bearbeitungsstand", { value: value as string })
          }
        >
          {bearbeitungsstandOptions.map((item) => (
            <Select.Option key={item.value} value={item.value}>
              {item.label}
            </Select.Option>
          ))}
        </Select>
      </Form.Item>

      <SectionHeader>Eigenschaften</SectionHeader>
      <Form.Item label={<FormLabel>Auftragsnummer</FormLabel>} className="mb-3">
        <Input
          placeholder="Auftragsnummer eingeben"
          onChange={(e) =>
            updateField("auftragsnummer", { value: e.target.value })
          }
        />
      </Form.Item>

      <Form.Item label={<FormLabel>Zugewiesen an</FormLabel>} className="mb-3">
        <Select
          placeholder="Team auswählen"
          className="w-full"
          allowClear
          showSearch
          optionFilterProp="children"
          onChange={(value) =>
            updateField("zugewiesenAn", { value: value as number })
          }
        >
          {teamOptions.map((item) => (
            <Select.Option key={item.id} value={item.id}>
              {item.name}
            </Select.Option>
          ))}
        </Select>
      </Form.Item>

      <SectionHeader>Zeitraum</SectionHeader>
      <DateRangeField
        label="Angelegt am"
        onChangeVon={(date) => updateField("angelegtAm", { von: date })}
        onChangeBis={(date) => updateField("angelegtAm", { bis: date })}
      />

      <Form.Item label={<FormLabel>Angelegt von</FormLabel>} className="mb-3">
        <Input
          placeholder="Benutzername eingeben"
          onChange={(e) =>
            updateField("angelegtVon", { value: e.target.value })
          }
        />
      </Form.Item>
    </Form>
  );
};

export default ArbeitsauftragSearch;
