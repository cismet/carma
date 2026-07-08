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
  onDelete?: () => void;
}

const FilterGroup = ({
  objectType,
  group,
  title,
  fields,
  onDelete,
}: FilterGroupProps) => {
  const dispatch = useDispatch();
  const { rules } = group;

  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-white">
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
              objectType={objectType}
              groupId={group.id}
              rule={rule}
              fields={fields}
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
        className="w-9 h-9 flex items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white text-gray-400 hover:border-blue-400 hover:text-blue-500 cursor-pointer transition-colors"
      >
        <PlusOutlined />
      </button>
    </div>
  );
};

export default FilterGroup;
