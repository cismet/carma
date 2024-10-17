import { MouseEvent, ReactNode } from "react";
import { useSelector } from "react-redux";

import { faCubes, faTreeCity } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";

import { SceneStyles } from "../../..";
import { selectShowPrimaryTileset } from '../../slices/cesium';
import useSceneStyleToggle from "../../hooks/useSceneStyleToggle";

type SceneStyleToggleProps = {
  children?: ReactNode;
  initialStyle?: keyof SceneStyles;
};

export const SceneStyleToggle = (props: SceneStyleToggleProps) => {
  const { initialStyle } = props;
  const toggleSceneStyle = useSceneStyleToggle(initialStyle);
  const isPrimaryStyle = useSelector(selectShowPrimaryTileset) === true;
  const handleToggle = (e: MouseEvent) => {
    e.preventDefault();
    toggleSceneStyle();
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
