import { ConnectorRibbon } from "@carma-commons/ui/components";

import type { BgData } from "./useFilterBackground";

const PAD = 0;
const BACKGROUND_COLOR = "rgba(255, 255, 255, 0.8)";

const FilterBackdrop = ({
  bgData,
  showContentBackdrop = true,
}: {
  bgData: BgData;
  showContentBackdrop?: boolean;
}) => {
  return (
    <>
      <ConnectorRibbon
        top={bgData.button}
        bottom={bgData.filter}
        color={BACKGROUND_COLOR}
      />
      {showContentBackdrop ? (
        <div
          className="absolute pointer-events-none"
          style={{
            zIndex: 0,
            left: bgData.filter.x - PAD,
            top: bgData.filter.y - PAD,
            width: bgData.filter.width + PAD * 2,
            height: bgData.filter.height + PAD * 2,
            backgroundColor: BACKGROUND_COLOR,
            borderRadius: "12px",
          }}
        />
      ) : null}
    </>
  );
};

export default FilterBackdrop;
