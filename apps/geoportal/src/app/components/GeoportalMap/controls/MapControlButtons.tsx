import { Math as CesiumMath } from "cesium";
import {
  Control,
  ControlButtonStyler,
} from "@carma-mapping/map-controls-layout";
import { useTourRefCollabLabels } from "../../../hooks/useTourRefCollabLabels";
import { Tooltip } from "antd";
import { useDispatch, useSelector } from "react-redux";
import {
  MapTypeSwitcher,
  PitchingCompass,
  selectViewerIsMode2d,
  useCesiumContext,
  useHomeControl,
  useZoomControls as useZoomControlsCesium,
} from "@carma-mapping/cesium-engine";
import {
  getUIAllow3d,
  getUIMode,
  toggleUIMode,
  UIMode,
} from "../../../store/slices/ui";
import { detectWebGLContext } from "@carma-commons/utils";
import useLeafletZoomControls from "../../../hooks/leaflet/useLeafletZoomControls";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCompress,
  faExpand,
  faHouseChimney,
  faInfo,
  faLocationArrow,
  faMinus,
  faPlus,
} from "@fortawesome/free-solid-svg-icons";
import {
  getShowFullscreenButton,
  getShowLocatorButton,
  getShowMeasurementButton,
} from "../../../store/slices/mapping";
import { isMobile } from "react-device-detect";
import LocateControlComponent from "./LocateControlComponent";
import { useContext, useState } from "react";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { CESIUM_CONFIG } from "../../../config/app.config";
import { setDrawingShape } from "../../../store/slices/measurements";
import { getUrlPrefix } from "../utils";
import {
  setFeatures,
  setPreferredLayerId,
  setSecondaryInfoBoxElements,
  setSelectedFeature,
} from "../../../store/slices/features";
import LayerWrapper from "../../layers/LayerWrapper";
import { LibFuzzySearch, SearchResultItem } from "@carma-mapping/fuzzy-search";
import {
  SelectionMetaData,
  useGazData,
  useSelection,
} from "@carma-apps/portals";
import { ENDPOINT, isAreaType } from "@carma-commons/resources";

interface MapControlButtonsProps {
  setPos: (pos: [number, number] | null) => void;
  marker?: string;
  markerAccent?: string;
}

// detect GPU support, disables 3d mode if not supported
let hasGPU = false;
const setHasGPU = (flag: boolean) => (hasGPU = flag);
const testGPU = () => detectWebGLContext(setHasGPU);
window.addEventListener("load", testGPU, false);

const MapControlButtons = ({
  setPos,
  marker,
  markerAccent,
}: MapControlButtonsProps) => {
  const tourRefLabels = useTourRefCollabLabels();
  const { routedMapRef: routedMap } =
    useContext<typeof TopicMapContext>(TopicMapContext);
  const dispatch = useDispatch();

  const [locationProps, setLocationProps] = useState(0);
  const [isMeasurementTooltip, setIsMeasurementTooltip] = useState(false);

  const allow3d = useSelector(getUIAllow3d) && hasGPU;
  const isMode2d = useSelector(selectViewerIsMode2d) || !allow3d;
  const showFullscreenButton = useSelector(getShowFullscreenButton);
  const showLocatorButton = useSelector(getShowLocatorButton);
  const showMeasurementButton = useSelector(getShowMeasurementButton);
  const uiMode = useSelector(getUIMode);

  const isModeMeasurement = uiMode === UIMode.MEASUREMENT;
  const isModeFeatureInfo = uiMode === UIMode.FEATURE_INFO;

  const { viewerRef, viewerAnimationMapRef } = useCesiumContext();

  const {
    handleZoomIn: handleZoomInCesium,
    handleZoomOut: handleZoomOutCesium,
  } = useZoomControlsCesium(viewerRef, viewerAnimationMapRef);
  const { zoomInLeaflet, zoomOutLeaflet } = useLeafletZoomControls();
  const homeControl = useHomeControl();
  const { gazData } = useGazData();
  const { setSelection } = useSelection();

  const handleToggleMeasurement = () => {
    dispatch(toggleUIMode(UIMode.MEASUREMENT));
  };

  const handleToggleFeatureInfo = () => {
    dispatch(toggleUIMode(UIMode.FEATURE_INFO));
  };

  const onGazetteerSelection = (selection: SearchResultItem) => {
    if (!selection) {
      console.debug("onGazetteerSelection", selection);
      setSelection(null);
      return;
    }
    const selectionMetaData: SelectionMetaData = {
      selectedFrom: "gazetteer",
      selectionTimestamp: Date.now(),
      isAreaSelection: isAreaType(selection.type as ENDPOINT),
    };

    setSelection(Object.assign({}, selection, selectionMetaData));
  };

  return (
    <>
      <Control position="topleft" order={10}>
        <div ref={tourRefLabels.zoom} className="flex flex-col">
          <Tooltip title="Maßstab vergrößern (Zoom in)" placement="right">
            <ControlButtonStyler
              onClick={isMode2d ? zoomInLeaflet : handleZoomInCesium}
              className="!border-b-0 !rounded-b-none font-bold !z-[9999999]"
              dataTestId="zoom-in-control"
            >
              <FontAwesomeIcon icon={faPlus} className="text-base" />
            </ControlButtonStyler>
          </Tooltip>
          <Tooltip title="Maßstab verkleinern (Zoom out)" placement="right">
            <ControlButtonStyler
              onClick={isMode2d ? zoomOutLeaflet : handleZoomOutCesium}
              className={`!rounded-t-none !border-t-[1px] ${
                allow3d && "!rounded-b-none !border-b-0"
              }`}
              dataTestId="zoom-out-control"
            >
              <FontAwesomeIcon icon={faMinus} className="text-base" />
            </ControlButtonStyler>
          </Tooltip>
          {allow3d && (
            <Tooltip title="Nach Norden ausrichten" placement="right">
              <ControlButtonStyler
                useDisabledStyle={false}
                className="!rounded-t-none !border-t-[1px]"
                ref={tourRefLabels.alignNorth}
                dataTestId="compass-control"
                disabled={isMode2d}
              >
                <PitchingCompass
                  viewerRef={viewerRef}
                  viewerAnimationMapRef={viewerAnimationMapRef}
                  maxPitch={CesiumMath.toRadians(-30)}
                />
              </ControlButtonStyler>
            </Tooltip>
          )}
        </div>
      </Control>
      <Control position="topleft" order={20}>
        {showFullscreenButton && (
          <Tooltip
            title={
              document.fullscreenElement
                ? "Vollbildmodus ausschalten"
                : "Vollbildmodus einschalten"
            }
            placement="right"
          >
            <ControlButtonStyler
              onClick={() => {
                if (document.fullscreenElement) {
                  document.exitFullscreen();
                } else {
                  document.documentElement.requestFullscreen();
                }
              }}
              ref={tourRefLabels.fullScreen}
              dataTestId="full-screen-control"
            >
              <FontAwesomeIcon
                icon={document.fullscreenElement ? faCompress : faExpand}
              />
            </ControlButtonStyler>
          </Tooltip>
        )}
      </Control>
      <Control position="topleft" order={30}>
        {showLocatorButton && isMobile && (
          <Tooltip title="Modus Standortanzeige einschalten" placement="right">
            <ControlButtonStyler
              ref={tourRefLabels.navigator}
              onClick={() => setLocationProps((prev) => prev + 1)}
              dataTestId="location-control"
            >
              <FontAwesomeIcon icon={faLocationArrow} className="text-2xl" />
            </ControlButtonStyler>
          </Tooltip>
        )}
        <LocateControlComponent startLocate={locationProps} />
      </Control>
      <Control position="topleft" order={40}>
        <Tooltip title="Auf Ausgangspunkt positionieren" placement="right">
          <ControlButtonStyler
            ref={tourRefLabels.home}
            onClick={() => {
              routedMap.leafletMap.leafletElement.flyTo(
                [51.272570027476256, 7.199918031692506],
                18
              );
              homeControl();
            }}
            dataTestId="home-control"
          >
            <FontAwesomeIcon icon={faHouseChimney} className="text-lg" />
          </ControlButtonStyler>
        </Tooltip>
      </Control>
      <Control position="topleft" order={60}>
        {showMeasurementButton && (
          <div className="flex items-center gap-4">
            <Tooltip
              title={
                !isMode2d
                  ? "zum Messen zu 2D-Modus wechseln"
                  : isModeMeasurement
                  ? "Messungsmodus ausschalten"
                  : "Messungsmodus einschalten"
              }
              // open={isMeasurementTooltip}
              defaultOpen={false}
              onOpenChange={() => {
                if (isModeMeasurement) {
                  setIsMeasurementTooltip(false);
                } else {
                  setIsMeasurementTooltip(!isMeasurementTooltip);
                }
              }}
              placement="right"
            >
              <ControlButtonStyler
                disabled={!isMode2d}
                onClick={() => {
                  if (!isModeMeasurement) {
                    dispatch(setDrawingShape(false));
                  }
                  setIsMeasurementTooltip(false);
                  handleToggleMeasurement();
                }}
                ref={tourRefLabels.measurement}
                dataTestId="measurement-control"
              >
                <img
                  src={`${getUrlPrefix()}${
                    isModeMeasurement ? "measure-active.png" : "measure.png"
                  }`}
                  alt="Measure"
                  className="w-6"
                />
              </ControlButtonStyler>
            </Tooltip>
          </div>
        )}
      </Control>
      {allow3d && (
        <Control position="topleft" order={70}>
          <MapTypeSwitcher
            duration={CESIUM_CONFIG.transitions.mapMode.duration}
            onComplete={(isTo2d: boolean) => {
              //dispatch(setBackgroundLayer({ ...backgroundLayer, visible: isTo2d }));
            }}
            ref={tourRefLabels.toggle2d3d}
          />
          {
            // TODO implement cesium home action with generic home control for all mapping engines
          }
        </Control>
      )}
      <Control position="topleft" order={50}>
        <Tooltip
          title={
            isModeFeatureInfo
              ? "Modus Multi-Sachdatenabfrage ausschalten"
              : "Modus Multi-Sachdatenabfrage einschalten"
          }
          placement="right"
        >
          <ControlButtonStyler
            disabled={!isMode2d}
            onClick={() => {
              handleToggleFeatureInfo();
              dispatch(setSelectedFeature(null));
              dispatch(setSecondaryInfoBoxElements([]));
              dispatch(setFeatures([]));
              setPos(null);
              dispatch(setPreferredLayerId(""));
              if (marker !== undefined) {
                routedMap.leafletMap.leafletElement.removeLayer(marker);
              }
              if (markerAccent !== undefined) {
                routedMap.leafletMap.leafletElement.removeLayer(markerAccent);
              }
            }}
            className="font-semibold"
            ref={tourRefLabels.featureInfo}
            dataTestId="feature-info-control"
          >
            <FontAwesomeIcon
              icon={faInfo}
              className={isModeFeatureInfo ? "text-[#1677ff]" : ""}
            />
          </ControlButtonStyler>
        </Tooltip>
      </Control>
      <Control position="topcenter" order={10}>
        {isMode2d && <LayerWrapper />}
      </Control>
      <Control position="bottomleft" order={10}>
        <div
          ref={tourRefLabels.gazetteer}
          data-test-id="fuzzy-search"
          className="h-full w-full"
        >
          <LibFuzzySearch
            gazData={gazData}
            //referenceSystem={referenceSystem}
            //referenceSystemDefinition={referenceSystemDefinition}
            onSelection={onGazetteerSelection}
            placeholder="Wohin?"
          />
        </div>
      </Control>
    </>
  );
};

export default MapControlButtons;
