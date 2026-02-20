import { useState } from "react";
import { Form, Row, Col, Select, DatePicker } from "antd";
import { useSelector } from "react-redux";
import { getKeyTablesData } from "../../../store/slices/keyTables";

interface MauerlascheSearchProps {
  onValuesChange?: (values: SearchValues) => void;
}

interface SearchValues {
  montage?: { von?: string; bis?: string };
  material?: { value?: number };
  pruefdatum?: { von?: string; bis?: string };
}

interface MaterialMauerlascheItem {
  id: number;
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

const MauerlascheSearch = ({ onValuesChange }: MauerlascheSearchProps) => {
  const [form] = Form.useForm();
  const keyTablesData = useSelector(getKeyTablesData);

  const [values, setValues] = useState<SearchValues>({
    montage: { von: "", bis: "" },
    material: { value: undefined },
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
  const materialOptions = [
    ...((keyTablesData.materialMauerlasche || []) as MaterialMauerlascheItem[]),
  ].sort((a, b) => {
    const aText = a.bezeichnung || "";
    const bText = b.bezeichnung || "";
    return aText.localeCompare(bText, "de", { sensitivity: "base" });
  });

  return (
    <Form form={form} layout="vertical" requiredMark={false} className="pr-2">
      <SectionHeader>Zeitraum</SectionHeader>
      <DateRangeField
        label="Montage"
        onChangeVon={(date) => updateField("montage", { von: date })}
        onChangeBis={(date) => updateField("montage", { bis: date })}
      />
      <DateRangeField
        label="Prüfung"
        onChangeVon={(date) => updateField("pruefdatum", { von: date })}
        onChangeBis={(date) => updateField("pruefdatum", { bis: date })}
      />

      <SectionHeader>Eigenschaften</SectionHeader>
      <Form.Item label={<FormLabel>Material</FormLabel>} className="mb-3">
        <Select
          placeholder="Material auswählen"
          className="w-full"
          allowClear
          showSearch
          optionFilterProp="children"
          onChange={(value) =>
            updateField("material", { value: value as number })
          }
        >
          {materialOptions.map((item) => (
            <Select.Option key={item.id} value={item.id}>
              {item.bezeichnung}
            </Select.Option>
          ))}
        </Select>
      </Form.Item>
    </Form>
  );
};

export default MauerlascheSearch;
