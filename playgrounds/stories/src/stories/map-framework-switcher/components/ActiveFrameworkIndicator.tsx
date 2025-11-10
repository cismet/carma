import { type CSSProperties } from "react";
import { Tag } from "antd";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import { styles } from "../helpers/styles";

interface ActiveFrameworkIndicatorProps {
  style?: CSSProperties;
}

export const ActiveFrameworkIndicator = ({
  style = styles.topCenterAbsolute,
}: ActiveFrameworkIndicatorProps) => {
  const { activeFramework } = useMapFrameworkSwitcherContext();

  return (
    <div style={style}>
      <Tag>{activeFramework ?? "Unknown Framework"}</Tag>
    </div>
  );
};
