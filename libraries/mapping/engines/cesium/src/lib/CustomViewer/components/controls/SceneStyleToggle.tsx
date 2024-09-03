import { MouseEvent, ReactNode } from "react";
import { faCubes, faTreeCity } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useShowPrimaryTileset } from "../../../CustomViewerContextProvider/slices/cesium";
import { SceneStyles } from "../../../..";
import { useSceneStyleToggle } from "../baseTileset.hook";
import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";

type SceneStyleToggleProps = {
  children?: ReactNode;
  initialStyle?: keyof SceneStyles;
};

export const SceneStyleToggle = (props: SceneStyleToggleProps) => {
  const { initialStyle } = props;
  const toggleSceneStyle = useSceneStyleToggle(initialStyle);
  const isPrimaryStyle = useShowPrimaryTileset() === true;
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
