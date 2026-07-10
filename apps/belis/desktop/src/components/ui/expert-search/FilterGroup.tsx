import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import { useDispatch } from "react-redux";
import FilterRule from "./rules/FilterRule";
import ConjunctionToggle from "./ConjunctionToggle";
import type { Field, ObjectType } from "./fieldRegistry";
import { defaultOperatorForType } from "./fieldRegistry";
import {
  addRule,
  removeRule,
  setGroupInnerConjunction,
  setGroupNegated,
} from "../../../store/slices/expertSearch";
import type { ExpertGroupState } from "../../../store/slices/expertSearch";

interface FilterGroupProps {
  objectType: ObjectType;
  group: ExpertGroupState;
  title: string;
  fields: Field[];
  selected?: boolean; // highlighted with a blue border when there are >1 groups
  onSelect?: () => void; // clicking anywhere in the group targets it for new rules
  onDelete?: () => void;
}

const FilterGroup = ({
  objectType,
  group,
  title,
  fields,
  selected,
  onSelect,
  onDelete,
}: FilterGroupProps) => {
  const dispatch = useDispatch();
  const { rules } = group;

  return (
    // Convenience: clicking anywhere in the group targets it for new rules.
    // The group is a container of interactive controls, so it stays a div
    // rather than becoming a (nested-button-invalid) button element.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
    <div
      onClick={onSelect}
      className={`border rounded-xl p-4 bg-white transition-colors ${
        onSelect ? "cursor-pointer" : ""
      } ${selected ? "border-blue-500" : "border-gray-200"}`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-gray-500 uppercase">
          <span className="w-2 h-2 rounded-sm bg-gray-300 flex-shrink-0" />
          {title}
          {group.negated && (
            <span className="text-blue-600 normal-case">(negiert)</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* NICHT: negate the whole group (Hasura `_not`) */}
          <button
            type="button"
            aria-pressed={group.negated}
            onClick={() =>
              dispatch(
                setGroupNegated({
                  objectType,
                  groupId: group.id,
                  negated: !group.negated,
                })
              )
            }
            title="Gruppe negieren (NICHT / _not)"
            className={`text-xs font-semibold px-3 py-1 rounded-md border cursor-pointer transition-colors ${
              group.negated
                ? "bg-blue-50 text-blue-600 border-blue-200"
                : "bg-white text-gray-400 border-gray-200 hover:text-gray-600"
            }`}
          >
            NICHT
          </button>
          <ConjunctionToggle
            value={group.conjunction}
            onChange={(conjunction) =>
              dispatch(
                setGroupInnerConjunction({
                  objectType,
                  groupId: group.id,
                  conjunction,
                })
              )
            }
          />
          {onDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
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
              objectType={objectType}
              groupId={group.id}
              rule={rule}
              fields={fields}
              // Values already picked by sibling rules on the same field +
              // operator — the value dropdown greys these out so the user can't
              // build an exact-duplicate condition.
              usedValues={rules
                .filter(
                  (r) =>
                    r.id !== rule.id &&
                    r.field === rule.field &&
                    r.operator === rule.operator &&
                    r.value !== undefined &&
                    r.value !== null &&
                    r.value !== ""
                )
                .map((r) => r.value)}
              onDelete={() =>
                dispatch(
                  removeRule({ objectType, groupId: group.id, ruleId: rule.id })
                )
              }
            />
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() =>
          dispatch(
            addRule({
              objectType,
              groupId: group.id,
              field: fields[0]?.key ?? "",
              operator: defaultOperatorForType(fields[0]?.type ?? "text"),
            })
          )
        }
        aria-label="Bedingung hinzufügen"
        // Kept in place but hidden for now — reveal by removing `hidden`.
        className="hidden w-9 h-9 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white text-gray-400 hover:border-blue-400 hover:text-blue-500 cursor-pointer transition-colors"
      >
        <PlusOutlined />
      </button>
    </div>
  );
};

export default FilterGroup;
