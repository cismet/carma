import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import FilterRule from "./rules/FilterRule";
import ConjunctionToggle from "./ConjunctionToggle";
import type { Conjunction } from "./ConjunctionToggle";
import type { Field } from "./fieldRegistry";

export interface FilterGroupHandle {
  addRule: (field?: string) => void;
}

interface FilterGroupProps {
  groupId: number;
  title: string;
  fields: Field[];
  onDelete?: () => void;
  onRuleCountChange?: (groupId: number, count: number) => void;
}

interface RuleItem {
  id: number;
  initialField?: string;
}

const FilterGroup = forwardRef<FilterGroupHandle, FilterGroupProps>(
  ({ groupId, title, fields, onDelete, onRuleCountChange }, ref) => {
    const [conjunction, setConjunction] = useState<Conjunction>("UND");
    const [rules, setRules] = useState<RuleItem[]>([]);
    const nextRuleId = useRef(1);

    useEffect(() => {
      onRuleCountChange?.(groupId, rules.length);
    }, [groupId, rules.length, onRuleCountChange]);

    const addRule = (field?: string) => {
      setRules((rs) => [...rs, { id: nextRuleId.current++, initialField: field }]);
    };

    const removeRule = (id: number) => {
      setRules((rs) => rs.filter((rule) => rule.id !== id));
    };

    useImperativeHandle(ref, () => ({ addRule }), []);

    return (
    <div className="border border-gray-200 rounded-xl p-4 bg-white">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-gray-500 uppercase">
          <span className="w-2 h-2 rounded-sm bg-gray-300 flex-shrink-0" />
          {title}
        </div>
        <div className="flex items-center gap-2">
          <ConjunctionToggle value={conjunction} onChange={setConjunction} />
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              aria-label="Gruppe entfernen"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 cursor-pointer transition-colors"
            >
              <DeleteOutlined />
            </button>
          )}
        </div>
      </div>
      {rules.length === 0 ? (
        <div className="text-sm text-gray-400 mb-3">
          Noch keine Bedingung — Feld links anklicken oder unten hinzufügen.
        </div>
      ) : (
        <div className="flex flex-col gap-2 mb-3">
          {rules.map((rule) => (
            <FilterRule
              key={rule.id}
              fields={fields}
              initialField={rule.initialField}
              onDelete={() => removeRule(rule.id)}
            />
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => addRule()}
        aria-label="Bedingung hinzufügen"
        className="w-9 h-9 flex items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white text-gray-400 hover:border-blue-400 hover:text-blue-500 cursor-pointer transition-colors"
      >
        <PlusOutlined />
      </button>
    </div>
    );
  }
);

FilterGroup.displayName = "FilterGroup";

export default FilterGroup;
