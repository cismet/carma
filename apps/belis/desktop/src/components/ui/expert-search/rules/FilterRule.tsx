import { useState } from "react";
import { Select, Input, InputNumber, DatePicker } from "antd";
import { DeleteOutlined } from "@ant-design/icons";

export type FieldType = "text" | "number" | "date" | "boolean" | "fk";

interface FieldOption {
  value: string;
  label: string;
  type: FieldType;
}

// Temporary hardcoded demo field definitions.
// The `type` drives which value input is rendered as the last element.
const FIELD_OPTIONS: FieldOption[] = [
  { value: "bemerkung", label: "Bemerkung", type: "text" },
  { value: "dokumente", label: "Dokumente", type: "text" },
  { value: "erstellungsjahr", label: "Erstellungsjahr", type: "number" },
  { value: "geometrie", label: "Geometrie", type: "text" },
  { value: "material", label: "Material", type: "fk" },
  { value: "strassenschluessel", label: "Straßenschlüssel", type: "fk" },
  { value: "foto", label: "Foto", type: "boolean" },
  { value: "geloescht", label: "Gelöscht", type: "boolean" },
  { value: "laufende_nummer", label: "Laufende Nummer", type: "number" },
  { value: "monteur", label: "Monteur", type: "text" },
  { value: "pruefdatum", label: "Prüfdatum", type: "date" },
  { value: "id", label: "ID", type: "number" },
];

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

// Temporary hardcoded demo foreign-key options (e.g. Straßenschlüssel).
const FK_OPTIONS = [
  { value: "01001", label: "01001 — Hauptstraße" },
  { value: "01002", label: "01002 — Bahnhofstraße" },
  { value: "01003", label: "01003 — Lindenallee" },
  { value: "02014", label: "02014 — Ravensberg" },
];

interface FilterRuleProps {
  onDelete?: () => void;
  initialField?: string;
}

const FilterRule = ({ onDelete, initialField }: FilterRuleProps) => {
  const [field, setField] = useState<string>(
    initialField ?? FIELD_OPTIONS[0].value
  );
  const [operator, setOperator] = useState<string>("contains");
  const [value, setValue] = useState<unknown>(undefined);

  const fieldDef = FIELD_OPTIONS.find((f) => f.value === field);
  const fieldType: FieldType = fieldDef?.type ?? "text";

  const handleFieldChange = (nextField: string) => {
    setField(nextField);
    // Reset the value because the input type may change with the field
    setValue(undefined);
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
        return (
          <Select
            className="w-full"
            showSearch
            optionFilterProp="label"
            value={value as string | undefined}
            onChange={(val) => setValue(val)}
            options={FK_OPTIONS}
            placeholder="— wählen —"
          />
        );
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
        options={FIELD_OPTIONS}
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
