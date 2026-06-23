import { MouseEvent, ReactNode } from "react";

import { faCubes, faTreeCity } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";

import { useCesiumContext } from "../../hooks/useCesiumContext";
import { SceneStyles } from "../../..";
type SceneStyleToggleProps = {
  children?: ReactNode;
  defaultStyle?: keyof SceneStyles;
  onToggle?: (isToPrimary: boolean) => void;
};

export const SceneStyleToggle = (props: SceneStyleToggleProps) => {
  const { currentSceneStyle, toggleCurrentSceneStyle } = useCesiumContext();
  const isPrimaryStyle = currentSceneStyle === "primary";
  const { onToggle } = props;
  const handleToggle = (e: MouseEvent) => {
    e.preventDefault();
    toggleCurrentSceneStyle();
    onToggle?.(isPrimaryStyle);
  };

  return (
    <ControlButtonStyler
      title={
        isPrimaryStyle
          ? "Wechsel zur vereinfachten Ansicht"
          : "Wechsel zur realistischen Ansicht"
      }
      onClick={handleToggle}
    >
      <FontAwesomeIcon
        icon={isPrimaryStyle ? faCubes : faTreeCity}
      ></FontAwesomeIcon>
    </ControlButtonStyler>
  );
};

export default SceneStyleToggle;
