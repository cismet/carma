import { faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useDispatch, useSelector } from "react-redux";
import {
  changeBackgroundOpacity,
  changeBackgroundVisibility,
  changeVisibility,
  getBackgroundLayer,
} from "../../store/slices/mapping";
import {
  getSelectedFeature,
  setSelectedFeature,
} from "../../store/slices/features";
import { cn } from "@carma-commons/utils";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";

interface VisibilityToggleProps {
  visible: boolean;
  id: string;
  isBackgroundLayer?: boolean;
  disabled?: boolean;
}

const VisibilityToggle = ({
  visible,
  id,
  isBackgroundLayer,
  disabled,
}: VisibilityToggleProps) => {
  const dispatch = useDispatch();
  const backgroundLayer = useSelector(getBackgroundLayer);
  const selectedFeature = useSelector(getSelectedFeature);
  const { isCesium } = useMapFrameworkSwitcherContext();

  return (
    <button
      className={cn(
        "hover:text-gray-500 text-gray-600 flex items-center justify-center",
        (isCesium || disabled) && "opacity-40 cursor-not-allowed"
      )}
      disabled={isCesium || disabled}
      onClick={(e) => {
        if (visible) {
          if (isBackgroundLayer) {
            dispatch(changeBackgroundVisibility(false));
          } else {
            dispatch(changeVisibility({ id, visible: false }));
            if (selectedFeature?.id === id) {
              dispatch(setSelectedFeature(null));
            }
          }
        } else {
          if (isBackgroundLayer) {
            dispatch(changeBackgroundVisibility(true));
          } else {
            dispatch(changeVisibility({ id, visible: true }));
          }
        }
      }}
    >
      <FontAwesomeIcon icon={visible ? faEye : faEyeSlash} />
    </button>
  );
};

export default VisibilityToggle;
