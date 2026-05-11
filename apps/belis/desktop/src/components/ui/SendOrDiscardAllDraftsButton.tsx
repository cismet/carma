import { Button } from "antd";
import { useSelector, useDispatch } from "react-redux";
import { useDatasheet } from "@carma-mapping/engines/maplibre";
import { AppDispatch } from "../../store";
import {
  clearAllDrafts,
  getDraftFeaturesCount,
} from "../../store/slices/featuresForms";

const SendOrDiscardAllDraftsButton = () => {
  const dispatch: AppDispatch = useDispatch();
  const draftCount = useSelector(getDraftFeaturesCount);
  const { closeDatasheet } = useDatasheet();

  const hasDrafts = draftCount > 0;

  const handleDiscardAll = () => {
    dispatch(clearAllDrafts());
    closeDatasheet();
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
