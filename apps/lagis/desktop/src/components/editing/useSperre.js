import { useSelector } from "react-redux";
import { getLandparcel } from "../../store/slices/lagis";
import { getDraftSection } from "../../store/slices/editing";

const useSperre = () => {
  const landparcel = useSelector(getLandparcel);
  const admin = useSelector(getDraftSection("admin"));
  const key = landparcel?.flurstueck_schluessel;
  return {
    sperre: Boolean(admin ? admin.sperre : key?.ist_gesperrt),
    reason: admin ? admin.sperreBemerkung : key?.bemerkung_sperre,
  };
};

export default useSperre;
