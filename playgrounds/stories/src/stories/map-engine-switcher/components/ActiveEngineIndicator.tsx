import { type CSSProperties } from "react";
import { Tag } from "antd";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import { styles } from "../helpers/styles";

interface ActiveEngineIndicatorProps {
  style?: CSSProperties;
}

export const ActiveEngineIndicator = ({
  style = styles.topCenterAbsolute,
}: ActiveEngineIndicatorProps) => {
  const { activeFramework: activeEngine } = useMapFrameworkSwitcherContext();

  return (
    <div style={style}>
      <Tag>{activeEngine ?? "Unknown Engine"}</Tag>
    </div>
  );
};
