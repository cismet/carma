import { useDispatch, useSelector } from "react-redux";
import {
  getDraftSection,
  getEditActive,
  patchDraftSection,
} from "../../store/slices/editing";
import { getLandparcel } from "../../store/slices/lagis";
import { isStaedtischKey } from "../../core/wizard/adminData";
import useSperre from "./useSperre";

// sections every parcel has; the others only städtische (see loadSections)
const ANY_PARCEL_SECTIONS = ["rebe", "kassenzeichen", "dms"];

const useEditSection = (section) => {
  const dispatch = useDispatch();
  const isEdit = useSelector(getEditActive);
  const draft = useSelector(getDraftSection(section));
  const landparcel = useSelector(getLandparcel);
  const { sperre } = useSperre();
  const patch = (changes) => dispatch(patchDraftSection({ section, changes }));
  const key = landparcel?.flurstueck_schluessel;
  const sectionEditable = isEdit
    ? Boolean(draft)
    : Boolean(key) &&
      (ANY_PARCEL_SECTIONS.includes(section) ||
        isStaedtischKey({ art: key.flurstueck_art }));
  return {
    editable: isEdit && Boolean(draft),
    locked: sperre && sectionEditable,
    draft,
    patch,
  };
};

export default useEditSection;
