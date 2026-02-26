import { faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useDispatch, useSelector } from "react-redux";
import {
  changeBackgroundVisibility,
  changeVisibility,
} from "../../store/slices/mapping";
import {
  getSelectedFeature,
  setSelectedFeature,
} from "../../store/slices/features";
import { cn } from "@carma-commons/utils";

interface VisibilityToggleProps {
  visible: boolean;
  id: string;
  isBackgroundLayer?: boolean;
  disabled?: boolean;
  onToggleVisible?: (visible: boolean) => void;
}

const VisibilityToggle = ({
  visible,
  id,
  isBackgroundLayer,
  disabled,
  onToggleVisible,
}: VisibilityToggleProps) => {
  const dispatch = useDispatch();
  const selectedFeature = useSelector(getSelectedFeature);
  const isDisabled = Boolean(disabled);

  return (
    <button
      className={cn(
        "hover:text-gray-500 text-gray-600 flex items-center justify-center",
        isDisabled && "opacity-40 cursor-not-allowed"
      )}
      disabled={isDisabled}
      onClick={() => {
        const nextVisible = !visible;
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
        onToggleVisible?.(nextVisible);
      }}
    >
      <FontAwesomeIcon icon={visible ? faEye : faEyeSlash} />
    </button>
  );
};

export default VisibilityToggle;
