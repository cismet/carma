import { Control } from "@carma-mapping/map-controls-layout";
import { useEffect, useState } from "react";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import {
  FullscreenControl,
  RoutedMapLocateControl,
  ZoomControl,
} from "@carma-mapping/components";

interface CarmaMapProps {
  layers;
  mapEngine: "leaflet" | "maplibre" | "cesium";
  onClick: () => void;
  onMove;
  customControls;
  use3DMap;
  useFeatureInfo;
  useImplicitSelection;
  modalMenu?: React.ReactNode;
  gazetteerSearchControl?: boolean;
  gazetteerSearchComponent?: React.ReactNode;
  applicationMenuTooltipString?: string;
  locatorControl?: boolean;
  fullScreenControl?: boolean;
  zoomControls?: boolean;
  contactButtonEnabled?: boolean;
  infoBox?: React.ReactNode;
}

export const CarmaMap = (props: CarmaMapProps) => {
  const { mapEngine, locatorControl, fullScreenControl, zoomControls } = props;
  const [map, setMap] = useState(<></>);

  useEffect(() => {
    if (mapEngine === "leaflet") {
      setMap(
        <TopicMapComponent
          {...props}
          locatorControl={false}
          fullScreenControl={false}
          zoomControls={false}
        />
      );
    }

    if (mapEngine === "maplibre") {
      setMap(<div>Libremap</div>);
    }
  }, [mapEngine]);

  return (
    <div>
      {zoomControls && (
        <Control position="topleft" order={10}>
          <ZoomControl />
        </Control>
      )}

      {fullScreenControl && (
        <Control position="topleft" order={50}>
          <FullscreenControl />
        </Control>
      )}

      {locatorControl && (
        <Control position="topleft" order={60}>
          <RoutedMapLocateControl
            tourRefLabels={null}
            disabled={false}
            nativeTooltip={true}
          />
        </Control>
      )}

      {map}
    </div>
  );
};

export default CarmaMap;
