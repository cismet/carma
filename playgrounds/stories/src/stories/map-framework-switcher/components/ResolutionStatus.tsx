import { type CSSProperties, useEffect, useState } from "react";
import { Statistic, Card, Typography } from "antd";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import { InfoTooltip } from "../../../components/InfoTooltip";
import { styles } from "../helpers/styles";

const { Text } = Typography;

interface ResolutionStatusProps {
  style?: CSSProperties;
  resolutionScale?: number;
  useBrowserRecommendedResolution?: boolean;
}

const formatNumber = (value: number | string) => {
  const num = Number(value);
  return num % 1 === 0 ? num.toString() : num.toFixed(3).replace(/\.?0+$/, "");
};

export const ResolutionStatus = ({
  style = styles.bottomLeftAbsolute,
  resolutionScale = 1,
  useBrowserRecommendedResolution = false,
}: ResolutionStatusProps) => {
  const { refs } = useMapFrameworkSwitcherContext();
  const [, forceUpdate] = useState(0);

  const dpr = window.devicePixelRatio;
  const cesiumScene = refs.getCesiumScene();
  const cesiumContainer = refs.getCesiumContainer();

  // Force re-render after resolution scale changes to pick up new buffer dimensions
  useEffect(() => {
    if (!cesiumScene) return;
    // Wait for Cesium to update buffer dimensions, then force re-render
    const timeout = setTimeout(() => forceUpdate((n) => n + 1), 100);
    return () => clearTimeout(timeout);
  }, [resolutionScale, useBrowserRecommendedResolution, cesiumScene]);

  const { clientHeight, clientWidth } = cesiumContainer ?? {};
  const drawingBufferHeight = cesiumScene?.drawingBufferHeight;
  const drawingBufferWidth = cesiumScene?.drawingBufferWidth;

  // Calculate effective pixel ratio as Cesium does:
  // let pixelRatio = widget._useBrowserRecommendedResolution ? 1.0 : window.devicePixelRatio;
  // pixelRatio *= widget._resolutionScale;
  const effectivePixelRatio =
    (useBrowserRecommendedResolution ? 1.0 : dpr) * resolutionScale;

  return (
    <Card size="small" style={style}>
      <div style={{ display: "flex", gap: "16px" }}>
        <Statistic
          title={
            <span>
              {"DPR "}
              <InfoTooltip
                title="Device Pixel Ratio"
                href="https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio"
                linkText="MDN Documentation"
              />
            </span>
          }
          value={dpr}
        />
        <Statistic
          title={
            <Text type="secondary">
              {"useDPR "}
              <InfoTooltip
                title="useBrowserRecommendedResolution - If true, ignores DPR and uses 1.0"
                href="https://cesium.com/learn/cesiumjs/ref-doc/CesiumWidget.html#useBrowserRecommendedResolution"
                linkText="Cesium Documentation"
              />
            </Text>
          }
          value={useBrowserRecommendedResolution ? "true" : "false"}
        />
        <Statistic
          title={
            <span>
              {"Scale "}
              <InfoTooltip
                title="Cesium Resolution Scale"
                href="https://cesium.com/learn/cesiumjs/ref-doc/Viewer.html#resolutionScale"
                linkText="Cesium Documentation"
              />
            </span>
          }
          value={resolutionScale}
          formatter={formatNumber}
        />
        <Statistic
          title={
            <span>
              {"PR "}
              <InfoTooltip
                title="Effective Pixel Ratio = (useBrowserRecommendedResolution ? 1.0 : DPR) × Scale"
                href="#"
                linkText=""
              />
            </span>
          }
          value={effectivePixelRatio}
          valueStyle={{
            fontWeight: useBrowserRecommendedResolution ? "normal" : "bold",
          }}
          formatter={formatNumber}
        />
        <Statistic
          title={<Text type="secondary">CSS Size</Text>}
          value={`${clientWidth ?? "?"}×${clientHeight ?? "?"}`}
        />
        <Statistic
          title={<Text type="secondary">Buffer</Text>}
          value={`${drawingBufferWidth ?? "?"}×${drawingBufferHeight ?? "?"}`}
        />
      </div>
    </Card>
  );
};
