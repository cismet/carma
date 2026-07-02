import { useState } from "react";
import { Select, Input, InputNumber, DatePicker } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import { useSelector } from "react-redux";
import { getKeyTablesData } from "../../../../store/slices/keyTables";
import { keyTableDisplayConfig } from "../../../../config/keyTableDisplayConfig";
import { parseTemplate } from "../../../../utils/templateParser";
import type { Field, FieldType } from "../fieldRegistry";

const OPERATOR_OPTIONS = [
  { value: "eq", label: "= ist gleich" },
  { value: "neq", label: "≠ ist ungleich" },
  { value: "contains", label: "≈ enthält" },
  { value: "gt", label: "> größer als" },
  { value: "gte", label: "≥ größer / gleich" },
  { value: "lt", label: "< kleiner als" },
  { value: "lte", label: "≤ kleiner / gleich" },
  { value: "empty", label: "ø ist leer" },
];

const BOOLEAN_OPTIONS = [
  { value: "true", label: "Ja" },
  { value: "false", label: "Nein" },
];

interface FilterRuleProps {
  fields: Field[];
  onDelete?: () => void;
  initialField?: string;
}

const FilterRule = ({ fields, onDelete, initialField }: FilterRuleProps) => {
  const keyTablesData = useSelector(getKeyTablesData);

  const [field, setField] = useState<string>(
    initialField ?? fields[0]?.key ?? ""
  );
  const [operator, setOperator] = useState<string>("contains");
  const [value, setValue] = useState<unknown>(undefined);

  const fieldDef = fields.find((f) => f.key === field);
  const fieldType: FieldType = fieldDef?.type ?? "text";

  const fieldOptions = fields.map((f) => ({ value: f.key, label: f.label }));

  const handleFieldChange = (nextField: string) => {
    setField(nextField);
    // Reset the value because the input type may change with the field
    setValue(undefined);
  };

  // FK options come from the redux key tables, labelled via the shared
  // keyTableDisplayConfig template — the same source the classic searches use.
  const renderFkInput = () => {
    const table = fieldDef?.fkTable;
    const rule = table ? keyTableDisplayConfig[table] : undefined;
    const items = ((table && keyTablesData[table]) || []) as Record<
      string,
      unknown
    >[];
    const options = items
      .map((item) => ({
        value: item.id as number,
        label: rule?.template
          ? parseTemplate(rule.template, item)
          : String(item.id),
      }))
      .sort((a, b) =>
        a.label.localeCompare(b.label, "de", {
          numeric: true,
          sensitivity: "base",
        })
      );

    return (
      <Select
        className="w-full"
        showSearch
        optionFilterProp="label"
        value={value as number | undefined}
        onChange={(val) => setValue(val)}
        options={options}
        placeholder="— wählen —"
      />
    );
  };

  // The last element type depends on the selected field.
  const renderValueInput = () => {
    // "ist leer" needs no value
    if (operator === "empty") {
      return null;
    }

    switch (fieldType) {
      case "number":
        return (
          <InputNumber
            className="w-full"
            value={value as number | undefined}
            onChange={(val) => setValue(val)}
            placeholder="Zahl eingeben…"
          />
        );
      case "date":
        return (
          <DatePicker
            className="w-full"
            value={value as never}
            onChange={(val) => setValue(val)}
            format="DD.MM.YYYY"
            placeholder="Datum wählen…"
          />
        );
      case "boolean":
        return (
          <Select
            className="w-full"
            value={value as string | undefined}
            onChange={(val) => setValue(val)}
            options={BOOLEAN_OPTIONS}
            placeholder="Ja / Nein"
          />
        );
      case "fk":
        return renderFkInput();
      case "text":
      default:
        return (
          <Input
            value={value as string | undefined}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Text eingeben…"
          />
        );
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Select
        className="w-44 flex-shrink-0"
        value={field}
        onChange={handleFieldChange}
        options={fieldOptions}
        showSearch
        optionFilterProp="label"
      />
      <Select
        className="w-40 flex-shrink-0"
        value={operator}
        onChange={setOperator}
        options={OPERATOR_OPTIONS}
      />
      <div className="flex-1 min-w-0">{renderValueInput()}</div>
      <button
        type="button"
        onClick={onDelete}
        aria-label="Bedingung entfernen"
        className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-400 hover:border-red-300 hover:text-red-500 cursor-pointer transition-colors"
      >
        <DeleteOutlined />
      </button>
    </div>
  );
};

export default FilterRule;
