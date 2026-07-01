import { useEffect, useRef, useState } from "react";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import FilterRule from "./rules/FilterRule";
import ConjunctionToggle from "./ConjunctionToggle";
import type { Conjunction } from "./ConjunctionToggle";

interface FilterGroupProps {
  groupId: number;
  title: string;
  onDelete?: () => void;
  onRuleCountChange?: (groupId: number, count: number) => void;
}

const FilterGroup = ({
  groupId,
  title,
  onDelete,
  onRuleCountChange,
}: FilterGroupProps) => {
  const [conjunction, setConjunction] = useState<Conjunction>("UND");
  const [ruleIds, setRuleIds] = useState<number[]>([]);
  const nextRuleId = useRef(1);

  useEffect(() => {
    onRuleCountChange?.(groupId, ruleIds.length);
  }, [groupId, ruleIds.length, onRuleCountChange]);

  const addRule = () => {
    setRuleIds((ids) => [...ids, nextRuleId.current++]);
  };

  const removeRule = (id: number) => {
    setRuleIds((ids) => ids.filter((ruleId) => ruleId !== id));
  };

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
      {ruleIds.length === 0 ? (
        <div className="text-sm text-gray-400 mb-3">
          Noch keine Bedingung — Feld links anklicken oder unten hinzufügen.
        </div>
      ) : (
        <div className="flex flex-col gap-2 mb-3">
          {ruleIds.map((id) => (
            <FilterRule key={id} onDelete={() => removeRule(id)} />
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={addRule}
        aria-label="Bedingung hinzufügen"
        className="w-9 h-9 flex items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white text-gray-400 hover:border-blue-400 hover:text-blue-500 cursor-pointer transition-colors"
      >
        <PlusOutlined />
      </button>
    </div>
  );
};

export default FilterGroup;
