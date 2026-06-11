import { faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useCallback } from "react";

import { cn } from "@carma-commons/utils";
import type { LayerVisibilityToggleLabels } from "./layer-visibility-toggle-props";

interface VisibilityToggleProps {
  visible: boolean;
  disabled?: boolean;
  labels: LayerVisibilityToggleLabels;
  onToggleVisibility: (visible: boolean) => void;
}

const VisibilityToggle = ({
  visible,
  disabled,
  labels,
  onToggleVisibility,
}: VisibilityToggleProps) => {
  const label = visible ? labels.hide : labels.show;
  const handleToggleVisibility = useCallback(() => {
    onToggleVisibility(!visible);
  }, [onToggleVisibility, visible]);

  return (
    <button
      className={cn(
        "hover:text-gray-500 text-gray-600 flex items-center justify-center",
        disabled && "opacity-40 cursor-not-allowed"
      )}
      disabled={disabled}
      title={disabled ? labels.disabled : label}
      aria-label={label}
      onClick={handleToggleVisibility}
    >
      <FontAwesomeIcon icon={visible ? faEye : faEyeSlash} />
    </button>
  );
};

export default VisibilityToggle;
