import type { BgData } from "./useFilterBackground";

const PAD = 0;
const OVERLAP = 12;
const BACKGROUND_COLOR = "rgba(255, 255, 255, 0.8)";

const FilterConnector = ({
  bgData,
  btnBgBottom,
  filterBgTop,
  connectorHeight,
}: {
  bgData: BgData;
  btnBgBottom: number;
  filterBgTop: number;
  connectorHeight: number;
}) => {
  const btnLeft = bgData.button.x - PAD;
  const btnRight = bgData.button.x + bgData.button.width + PAD;
  const fltLeft = bgData.filter.x - PAD - 2;
  const fltRight = bgData.filter.x + bgData.filter.width + PAD + 2;
  const svgLeft = Math.min(btnLeft, fltLeft);
  const svgRight = Math.max(btnRight, fltRight);
  const svgWidth = svgRight - svgLeft;
  const svgHeight = connectorHeight;
  const gapHeight = filterBgTop - btnBgBottom;

  const r = 12;
  const bl = btnLeft - svgLeft;
  const br = btnRight - svgLeft;
  const fl = fltLeft - svgLeft;
  const fr = fltRight - svgLeft;
  const top = OVERLAP;
  const bot = OVERLAP + gapHeight;
  const clipId = "connector-clip";

  return (
    <svg
      className="absolute pointer-events-none"
      style={{
        zIndex: -1,
        left: svgLeft,
        top: btnBgBottom - OVERLAP,
        width: svgWidth,
        height: svgHeight,
        overflow: "visible",
      }}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={0} y={0} width={svgWidth} height={bot + 0.5} />
        </clipPath>
      </defs>
      <path
        clipPath={`url(#${clipId})`}
        d={`
          M ${bl},0
          L ${br},0
          L ${br},${top}
          C ${br},${top + gapHeight * 0.7} ${fr - r},${top + gapHeight * 0.5} ${
          fr - r
        },${bot}
          Q ${fr - r},${bot + r} ${fr},${bot + r}
          L ${fr},${svgHeight}
          L ${fl},${svgHeight}
          L ${fl},${bot + r}
          Q ${fl + r},${bot + r} ${fl + r},${bot}
          C ${fl},${top + gapHeight * 0.5} ${bl},${
          top + gapHeight * 0.7
        } ${bl},${top}
          L ${bl},0
          Z
        `}
        fill={BACKGROUND_COLOR}
      />
    </svg>
  );
};

const FilterBackdrop = ({ bgData }: { bgData: BgData }) => {
  const btnBgBottom = bgData.button.y + bgData.button.height + PAD;
  const filterBgTop = bgData.filter.y - PAD;
  const connectorHeight = filterBgTop - btnBgBottom + OVERLAP * 2;

  return (
    <>
      {connectorHeight > 0 && (
        <FilterConnector
          bgData={bgData}
          btnBgBottom={btnBgBottom}
          filterBgTop={filterBgTop}
          connectorHeight={connectorHeight}
        />
      )}
      <div
        className="absolute pointer-events-none"
        style={{
          zIndex: -1,
          left: bgData.filter.x - PAD,
          top: bgData.filter.y - PAD,
          width: bgData.filter.width + PAD * 2,
          height: bgData.filter.height + PAD * 2,
          backgroundColor: BACKGROUND_COLOR,
          borderRadius: "12px",
        }}
      />
    </>
  );
};

export default FilterBackdrop;
