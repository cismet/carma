import { useDispatch, useSelector } from "react-redux";
import ConjunctionToggle from "./ConjunctionToggle";
import type { ObjectType } from "./fieldRegistry";
import {
  setGroupConjunction,
  getExpertTypeState,
} from "../../../store/slices/expertSearch";

interface GroupConjunctionProps {
  objectType: ObjectType;
}

// Separator with a centered UND/ODER toggle, shown between two groups. All
// separators reflect the single per-type groupConjunction from redux.
const GroupConjunction = ({ objectType }: GroupConjunctionProps) => {
  const dispatch = useDispatch();
  const { groupConjunction } = useSelector(getExpertTypeState(objectType));

  return (
    <div className="flex items-center gap-3 py-1">
      <div className="flex-1 h-px bg-gray-200" />
      <ConjunctionToggle
        value={groupConjunction}
        onChange={(conjunction) =>
          dispatch(setGroupConjunction({ objectType, conjunction }))
        }
      />
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  );
};

export default GroupConjunction;
