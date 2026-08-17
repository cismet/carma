import { Button } from "antd";
import { useSelector, useDispatch } from "react-redux";
import { useDatasheet } from "@carma-mapping/engines/maplibre";
import { addMeasurements } from "@carma-mapping/measurements";
import { AppDispatch } from "../../store";
import {
  clearAllDrafts,
  getAllDrafts,
  getDraftFeaturesCount,
} from "../../store/slices/featuresForms";
import { getMeasurements } from "../../store/slices/measurements";
import { useMapPage } from "../../contexts/MapPageContext";

const SendOrDiscardAllDraftsButton = () => {
  const dispatch: AppDispatch = useDispatch();
  const draftCount = useSelector(getDraftFeaturesCount);
  const drafts = useSelector(getAllDrafts);
  const measurements = useSelector(getMeasurements);
  const { closeDatasheet } = useDatasheet();
  const { onDraftsCleared } = useMapPage();

  const hasDrafts = draftCount > 0;

  const handleDiscardAll = () => {
    // Bring every attached measurement back into terra-draw before the
    // drafts vanish — the measurement records persist in Redux while
    // attached but are hidden from the map; without this they'd stay
    // invisible after the discard.
    const toRestore = [];
    for (const draft of Object.values(drafts)) {
      const key = draft.geometryKey;
      if (!key || !key.startsWith("measurement.")) continue;
      const feature = measurements.find(
        (f) => `measurement.${String(f.id)}` === key
      );
      if (!feature) continue;
      const rawId = String(feature.id).replace(/^measurement\./, "");
      toRestore.push({ ...feature, id: rawId });
    }
    if (toRestore.length > 0) addMeasurements(toRestore);
    dispatch(clearAllDrafts());
    // Stay in the Datenblatt (the host re-points it at the first list row when
    // the open form belonged to a creation draft). Only when no host published
    // a handler is there nothing left to show — fall back to the map.
    if (onDraftsCleared) {
      onDraftsCleared();
    } else {
      closeDatasheet();
    }
  };

  return (
    <span style={!hasDrafts ? { cursor: "not-allowed" } : undefined}>
      <Button
        onClick={hasDrafts ? handleDiscardAll : undefined}
        style={
          !hasDrafts
            ? {
                pointerEvents: "none",
                color: "#d9d9d9",
                borderColor: "#d9d9d9",
                backgroundColor: "#f5f5f5",
              }
            : undefined
        }
      >
        Alle verwerfen
      </Button>
    </span>
  );
};

export default SendOrDiscardAllDraftsButton;
