import { ResponsiveStatusBar } from "@carma-commons/ui/components";
import type { ReactNode } from "react";
import { GEO_STORY_STYLES } from "./geo-story-styles";

type GeoChartStoryFrameProps = {
  label: string;
  values: string[];
  children: ReactNode;
};

export const GeoChartStoryFrame = ({
  label,
  values,
  children,
}: GeoChartStoryFrameProps) => (
  <div style={GEO_STORY_STYLES.layout.page}>
    <div style={GEO_STORY_STYLES.layout.topBar}>
      <ResponsiveStatusBar
        barHeight={`${GEO_STORY_STYLES.chrome.topBarHeightPx}px`}
        fontSize={16}
        text={
          <div style={GEO_STORY_STYLES.layout.topBarContent}>
            <span style={GEO_STORY_STYLES.text.topBarLabel}>{label}</span>
            {values.map((value, index) => (
              <span
                key={`geo-status-value-${index}`}
                style={GEO_STORY_STYLES.text.topBarValue}
              >
                {value}
              </span>
            ))}
          </div>
        }
      />
    </div>
    <div style={GEO_STORY_STYLES.layout.content}>{children}</div>
  </div>
);
