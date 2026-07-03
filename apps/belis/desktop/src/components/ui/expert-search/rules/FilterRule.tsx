import { Select, Input, InputNumber, DatePicker } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import { useDispatch, useSelector } from "react-redux";
import { getKeyTablesData } from "../../../../store/slices/keyTables";
import {
  setRuleField,
  setRuleOperator,
  setRuleValue,
  isRuleComplete,
} from "../../../../store/slices/expertSearch";
import type { ExpertRuleState } from "../../../../store/slices/expertSearch";
import { keyTableDisplayConfig } from "../../../../config/keyTableDisplayConfig";
import { parseTemplate } from "../../../../utils/templateParser";
import type { Field, FieldType, ObjectType } from "../fieldRegistry";
import { defaultOperatorForType } from "../fieldRegistry";

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

// Only offer operators that actually mean something for the field type, so the
// dropdown never shows a choice that silently degrades in buildRuleCondition:
//  - "enthält" (substring/_ilike) is a Text-only concept.
//  - Ja/Nein only needs "=" and "ist leer": "≠ Ja" is just "= Nein", and the
//    comparison operators (>, ≥, <, ≤) collapse to _eq there.
const getOperatorOptions = (fieldType: FieldType) =>
  OPERATOR_OPTIONS.filter((op) => {
    if (op.value === "contains") return fieldType === "text";
    if (fieldType === "boolean") {
      return op.value === "eq" || op.value === "empty";
    }
    return true;
  });

const BOOLEAN_OPTIONS = [
  { value: "true", label: "Ja" },
  { value: "false", label: "Nein" },
];

// Some reference key tables (bezirk, straßenschlüssel) are intentionally absent
// from keyTableDisplayConfig — they are read-only and must not show up in the
// key-table management UI (which lists every config key). Their option-label
// templates for the FK dropdowns live here instead, so the selects show names
// rather than raw ids.
const FK_LABEL_TEMPLATE_FALLBACK: Record<string, string> = {
  bezirk: "{bezirk}",
  // Show the key (pk) then the street name, e.g. "1234 - Musterstraße".
  "straßenschlüssel": "{pk} - {strasse}",
  // querschnitt has no keyTableDisplayConfig entry; label options by size.
  querschnitt: "{groesse}",
};

interface FilterRuleProps {
  objectType: ObjectType;
  groupId: number;
  rule: ExpertRuleState;
  fields: Field[];
  onDelete?: () => void;
}

const FilterRule = ({
  objectType,
  groupId,
  rule,
  fields,
  onDelete,
}: FilterRuleProps) => {
  const dispatch = useDispatch();
  const keyTablesData = useSelector(getKeyTablesData);

  const { id: ruleId, field, operator, value } = rule;

  const fieldDef = fields.find((f) => f.key === field);
  const fieldType: FieldType = fieldDef?.type ?? "text";

  // Value is required for every operator except "ist leer"; flag it when empty
  // so the input shows a red border (and the Suchen button can be disabled).
  const hasError = !isRuleComplete(rule);
  const errorStatus = hasError ? "error" : undefined;

  const fieldOptions = fields.map((f) => ({ value: f.key, label: f.label }));

  const setValue = (val: unknown) =>
    dispatch(setRuleValue({ objectType, groupId, ruleId, value: val }));
  const setOperator = (op: string) =>
    dispatch(setRuleOperator({ objectType, groupId, ruleId, operator: op }));

  const handleFieldChange = (nextField: string) => {
    // The reducer also resets the value, since the input type may change.
    dispatch(setRuleField({ objectType, groupId, ruleId, field: nextField }));
    // When the field TYPE changes, reset to that type's default operator
    // (Text → "enthält", otherwise "="). Switching between same-type fields
    // keeps the chosen operator.
    const nextType = fields.find((f) => f.key === nextField)?.type ?? "text";
    if (nextType !== fieldType) {
      dispatch(
        setRuleOperator({
          objectType,
          groupId,
          ruleId,
          operator: defaultOperatorForType(nextType),
        })
      );
    }
  };

  // FK options come from the redux key tables, labelled via the shared
  // keyTableDisplayConfig template — the same source the classic searches use.
  const renderFkInput = () => {
    const table = fieldDef?.fkTable;
    const template =
      (table && keyTableDisplayConfig[table]?.template) ??
      (table && FK_LABEL_TEMPLATE_FALLBACK[table]) ??
      undefined;
    const items = ((table && keyTablesData[table]) || []) as Record<
      string,
      unknown
    >[];
    // straßenschlüssel has admin codes without a street name; drop those so the
    // dropdown never shows a bare number (mirrors StrassenschluesselFieldsModal).
    const usableItems =
      table === "straßenschlüssel"
        ? items.filter((item) => item.pk && item.strasse)
        : items;
    const options = usableItems
      .map((item) => ({
        value: item.id as number,
        label: template ? parseTemplate(template, item) : String(item.id),
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
        status={errorStatus}
        showSearch
        optionFilterProp="label"
        // Match anywhere in the label so both the number (pk) and the text
        // (e.g. street name) are searchable.
        filterOption={(input, option) =>
          (option?.label ?? "")
            .toLowerCase()
            .includes(input.toLowerCase())
        }
        value={value as number | undefined}
        onChange={(val) => setValue(val)}
        options={options}
        placeholder={
          fieldDef?.label ? `${fieldDef.label} auswählen…` : "— wählen —"
        }
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
            status={errorStatus}
            value={value as number | undefined}
            onChange={(val) => setValue(val)}
            placeholder="Zahl eingeben…"
          />
        );
      case "date":
        return (
          <DatePicker
            className="w-full"
            status={errorStatus}
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
            status={errorStatus}
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
            status={errorStatus}
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
        options={getOperatorOptions(fieldType)}
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
