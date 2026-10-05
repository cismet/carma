import { useDispatch, useSelector } from "react-redux";
import {
  getDraftSection,
  getEditActive,
  patchDraftSection,
} from "../../store/slices/editing";

// editable is false in edit mode when the parcel has no such section,
// e.g. Verwaltungsbereiche on a non-städtisch parcel
const useEditSection = (section) => {
  const dispatch = useDispatch();
  const isEdit = useSelector(getEditActive);
  const draft = useSelector(getDraftSection(section));
  const patch = (changes) => dispatch(patchDraftSection({ section, changes }));
  return { editable: isEdit && Boolean(draft), draft, patch };
};

export default useEditSection;
