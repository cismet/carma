import { useContext } from "react";

import {
  faHouseChimney,
  faMinus,
  faPlus,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";

import { useGazData } from "@carma-appframeworks/portals";
import {
  FullscreenControl,
  MapFrameworkSwitcher,
  RoutedMapLocateControl,
  useMapFrameworkSwitcherContext,
} from "@carma-mapping/components";
import {
  PitchingCompass,
  useCesiumContext,
  useZoomControls as useZoomControlsCesium,
} from "@carma-mapping/engines/cesium/react/runtime";
import {
  LibFuzzySearch,
  type SearchResultItem,
} from "@carma-mapping/fuzzy-search";
import {
  Control,
  ControlButtonStyler,
  ControlLayout,
} from "@carma-mapping/map-controls-layout";

import useLeafletZoomControls from "../hooks/useLeafletZoomControls";

type MapControlsProps = {
  is3dSupported: boolean;
  onHomeClick: () => void;
  onGazetteerSelection: (selection: SearchResultItem | null) => void;
};

/**
 * Map toolbar: zoom, compass + framework switcher, fullscreen, locate, home, gazetteer search.
 */
export const MapControls = ({
  is3dSupported,
  onHomeClick,
  onGazetteerSelection,
}: MapControlsProps) => {
  const { responsiveState, gap, windowSize } = useContext<
    typeof ResponsiveTopicMapContext
  >(ResponsiveTopicMapContext);
  const pixelwidth =
    responsiveState === "normal" ? "300px" : windowSize.width - gap - 2;

  const { gazData } = useGazData();
  const { isCesium, isLeaflet } = useMapFrameworkSwitcherContext();

  const ctx = useCesiumContext();
  const {
    handleZoomIn: handleZoomInCesium,
    handleZoomOut: handleZoomOutCesium,
  } = useZoomControlsCesium(ctx, { fovMode: false });
  const { zoomInLeaflet, zoomOutLeaflet } = useLeafletZoomControls();

  return (
    <ControlLayout ifStorybook={false}>
      <Control position="topleft" order={10}>
        <div className="flex flex-col">
          <ControlButtonStyler
            onClick={isLeaflet ? zoomInLeaflet : handleZoomInCesium}
            className="!border-b-0 !rounded-b-none font-bold !z-[9999999]"
            dataTestId="zoom-in-control"
            title="Maßstab vergrößern (Zoom in)"
          >
            <FontAwesomeIcon icon={faPlus} className="text-base" />
          </ControlButtonStyler>
          <ControlButtonStyler
            onClick={isLeaflet ? zoomOutLeaflet : handleZoomOutCesium}
            className="!rounded-t-none !border-t-[1px]"
            dataTestId="zoom-out-control"
            title="Maßstab verkleinern (Zoom out)"
          >
            <FontAwesomeIcon icon={faMinus} className="text-base" />
          </ControlButtonStyler>
        </div>
      </Control>
      {is3dSupported && (
        <Control position="topleft" order={30}>
          <div className="flex flex-col">
            <ControlButtonStyler
              useDisabledStyle={false}
              className="!border-b-0 !rounded-b-none font-bold !z-[9999999]"
              disabled={isLeaflet}
              dataTestId="compass-control"
              title="Nach Norden ausrichten"
            >
              <PitchingCompass />
            </ControlButtonStyler>
            <MapFrameworkSwitcher nativeTooltip={true} />
          </div>
        </Control>
      )}
      <Control position="topleft" order={50}>
        <FullscreenControl />
      </Control>
      <Control position="topleft" order={60}>
        <RoutedMapLocateControl
          tourRefLabels={null}
          disabled={isCesium}
          nativeTooltip={true}
        />
      </Control>
      <Control position="topleft" order={70}>
        <ControlButtonStyler
          onClick={onHomeClick}
          dataTestId="home-control"
          title={"Zur Startposition:\nÜberflutungsbereich Unterdörnen, Barmen"}
        >
          <FontAwesomeIcon icon={faHouseChimney} className="text-lg" />
        </ControlButtonStyler>
      </Control>
      <Control position="bottomleft" order={10}>
        <div className="pl-1">
          <LibFuzzySearch
            gazData={gazData}
            pixelwidth={pixelwidth}
            onSelection={onGazetteerSelection}
            placeholder="Stadtteil | Adresse | POI | GEP"
          />
        </div>
      </Control>
    </ControlLayout>
  );
};

export default MapControls;
