import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { useDispatch, useSelector } from "react-redux";

import InfoBoxFotoPreview from "react-cismap/topicmaps/InfoBoxFotoPreview";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { LightBoxDispatchContext } from "react-cismap/contexts/LightBoxContextProvider";

import { additionalInfoFactory } from "@carma-collab/wuppertal/geoportal";
import { genericSecondaryInfoFooterFactory } from "@carma-collab/wuppertal/commons";

import {
  setPreferredLayerId,
  setSelectedFeature,
  updateSecondaryInfoBoxElements,
  getInfoText,
  getSecondaryInfoBoxElements,
  getSelectedFeature,
  setSecondaryInfoBoxElements,
  getLoading,
  moveFeatureToEnd,
  removeSecondaryInfoBoxElement,
  moveFeatureToFront,
  setPreferredVectorLayerId,
} from "../../store/slices/features";
import { getLayers, getMaplibreMaps } from "../../store/slices/mapping";
import { truncateString } from "./featureInfoHelper";

import "../infoBox.css";
import LoadingInfoBox from "./LoadingInfoBox";

import versionData from "../../../version.json";
import {
  getApplicationVersion,
  isHtmlString,
  updateUrl,
} from "@carma-commons/utils";
import {
  InfoBox,
  InfoBoxHeader,
  utils,
  getActionLinksForFeature,
  PanoramaLightBox,
  PanoramaPreview,
} from "@carma-appframeworks/portals";
import { parseColor } from "../../helper/color";
import { useFeatureFlags } from "@carma-providers/feature-flag";
import { addCustomFeatureFlags } from "../../store/slices/layers";
import type { FeatureInfo } from "@carma-mapping/utils";
import { selectionPadding } from "../../constants/selection";

// Panorama: live-rotate the selected arrow on the map to follow the viewing
// direction inside the 360° viewer. The style layer that renders the selected
// arrow (see oelberg_panorama style.json). Only the selected feature is visible
// in that layer, so overriding the layer-wide icon-rotate to a constant rotates
// just the visible arrow; we restore the data-driven value on deselect.
const PANORAMA_SELECTION_ARROW_LAYER = "selection-arrow";
// Calibration: map icon-rotate is clockwise-from-north (deg); pannellum yaw is
// degrees from the image centre (positive to the right). Tune sign/offset once
// against the live behaviour.
const PANORAMA_YAW_SIGN = 1;
const PANORAMA_YAW_OFFSET = 0;

interface InfoBoxProps {
  pos?: [number, number];
  onZoomToFeature?: (feature: FeatureInfo) => void;
  displayOrbit?: boolean;
  isOrbiting?: boolean;
  onOrbitToggle?: () => void;
  additionalSecondaryInfoBoxElements?: ReactNode[];
}

const FeatureInfoBox = ({
  pos,
  onZoomToFeature,
  displayOrbit = false,
  isOrbiting = false,
  onOrbitToggle,
  additionalSecondaryInfoBoxElements = [],
}: InfoBoxProps) => {
  const [open, setOpen] = useState(false);
  const [openPanorama, setOpenPanorama] = useState(false);
  const [shouldRenderLoadingInfobox, setShouldRenderLoadingInfobox] =
    useState(false);
  const [headerColor, setHeaderColor] = useState<string>("");
  const [parsedHeader, setParsedHeader] = useState<string>("");
  const dispatch = useDispatch();
  const flags = useFeatureFlags();

  const loadingFeatureInfo = useSelector(getLoading);
  const selectedFeature = useSelector(getSelectedFeature);
  const secondaryInfoBoxElements = useSelector(getSecondaryInfoBoxElements);
  const layers = useSelector(getLayers);
  const numOfLayers = layers.length;
  const infoText = useSelector(getInfoText);
  const maplibreMaps = useSelector(getMaplibreMaps);
  const lightBoxDispatchContext = useContext(LightBoxDispatchContext);

  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);

  if (secondaryInfoBoxElements.length > 4) {
    dispatch(setSecondaryInfoBoxElements([]));
    dispatch(
      setSelectedFeature({
        properties: {
          header: "Information",
          headerColor: "#0078a8",
          title: `Es wurden ${secondaryInfoBoxElements.length} Objekte gefunden. Bis zu 4 Objekte können angezeigt werden.`,
          additionalInfo: `Position: ${pos[0].toFixed(5)}, ${pos[1].toFixed(
            5
          )}`,
          subtitle:
            "Hereinzoomen oder Kartenebenen ausblenden, um die Objektanzahl zu reduzieren.",
        },
        id: "information",
      })
    );
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (secondaryInfoBoxElements.length === 0) {
        return;
      }
      if (event.ctrlKey) {
        switch (event.key) {
          case "ArrowUp":
            event.preventDefault();
            const nextFeature = secondaryInfoBoxElements[0];
            dispatch(removeSecondaryInfoBoxElement(nextFeature));
            dispatch(moveFeatureToEnd(selectedFeature));
            dispatch(setSelectedFeature(nextFeature));
            break;
          case "ArrowDown":
            event.preventDefault();
            const prevFeature =
              secondaryInfoBoxElements[secondaryInfoBoxElements.length - 1];
            dispatch(removeSecondaryInfoBoxElement(prevFeature));

            dispatch(moveFeatureToFront(selectedFeature));
            dispatch(setSelectedFeature(prevFeature));
            break;
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [secondaryInfoBoxElements]);

  let links = [];

  const canZoomToFeature = (selectedFeature) => {
    if (
      selectedFeature.properties?.sourceProps?.bounds ||
      selectedFeature.geometry
    ) {
      return true;
    }
    return false;
  };

  useEffect(() => {
    if (selectedFeature?.properties?.ffmodal) {
      dispatch(
        addCustomFeatureFlags({
          [selectedFeature.properties.ffmodal]: {
            alias: selectedFeature.properties.ffmodal,
            default: false,
          },
        })
      );
    }
  }, [selectedFeature, dispatch]);

  const shouldDisplaySecondaryInfo = (() => {
    if (!selectedFeature?.properties) return false;

    if (selectedFeature.properties.modal) return true;

    // if ffmodal is used check for the it as a feature flag
    if (selectedFeature.properties.ffmodal) {
      return !!flags[selectedFeature.properties.ffmodal];
    }
    return false;
  })();

  if (selectedFeature && canZoomToFeature(selectedFeature)) {
    links = getActionLinksForFeature(selectedFeature, {
      displaySecondaryInfoAction: shouldDisplaySecondaryInfo,
      setVisibleStateOfSecondaryInfo: () => {
        setOpen(true);
      },
      displayZoomToFeature: true,
      zoomToFeature: () => {
        utils.zoomToFeature({
          selectedFeature,
          leafletMap: routedMapRef?.leafletMap?.leafletElement,
          padding: selectionPadding,
        });
        if (onZoomToFeature) {
          onZoomToFeature(selectedFeature as FeatureInfo);
        }
      },
      displayOrbit,
      isOrbiting,
      onOrbitToggle,
    });
  }

  const loadingRef = useRef(loadingFeatureInfo);

  useEffect(() => {
    loadingRef.current = loadingFeatureInfo;

    if (!loadingFeatureInfo) {
      setShouldRenderLoadingInfobox(false);
    } else {
      setTimeout(() => {
        if (loadingRef.current) {
          setShouldRenderLoadingInfobox(true);
        }
      }, 100);
    }
  }, [loadingFeatureInfo]);

  useEffect(() => {
    if (selectedFeature && selectedFeature.properties.sourceProps) {
      console.log(
        "feature properties:",
        selectedFeature.properties.sourceProps
      );
    }

    const updateHeaderAndColor = async () => {
      // Parse header if it exists
      if (selectedFeature?.properties?._header) {
        const header = await utils.parseHeader(
          selectedFeature.properties._header,
          selectedFeature.properties.sourceProps ?? {}
        );
        setParsedHeader(header || "Informationen");
      } else {
        setParsedHeader(selectedFeature?.properties?.header || "Informationen");
      }

      // Parse header color
      if (selectedFeature?.properties?.accentColor) {
        const color = await parseColor(
          selectedFeature.properties.accentColor,
          selectedFeature.properties.sourceProps ?? {}
        );
        setHeaderColor(color || "#0078a8");
      } else {
        setHeaderColor(selectedFeature?.properties?.headerColor || "#0078a8");
      }
    };

    updateHeaderAndColor();
  }, [selectedFeature]);

  useEffect(() => {
    console.log("[PANORAMA] selected feature", {
      selectedFeature,
      panorama: selectedFeature?.properties?.panorama,
      sourceProps: selectedFeature?.properties?.sourceProps,
    });
  }, [selectedFeature]);

  // The maplibre map for the currently selected layer (holds the panorama
  // arrow layers); selectedFeature.id is the layer id.
  const selectedLayerMap = useMemo(
    () => maplibreMaps?.find((entry) => entry.id === selectedFeature?.id)?.map,
    [maplibreMaps, selectedFeature?.id]
  );
  const panoramaHeading = Number(
    selectedFeature?.properties?.sourceProps?.heading
  );

  // Rotate the selected arrow to follow the panorama view direction.
  const handlePanoramaYaw = useCallback(
    (yaw: number) => {
      if (
        !selectedLayerMap ||
        typeof selectedLayerMap.getLayer !== "function" ||
        !selectedLayerMap.getLayer(PANORAMA_SELECTION_ARROW_LAYER) ||
        Number.isNaN(panoramaHeading)
      ) {
        return;
      }
      selectedLayerMap.setLayoutProperty(
        PANORAMA_SELECTION_ARROW_LAYER,
        "icon-rotate",
        panoramaHeading + yaw * PANORAMA_YAW_SIGN + PANORAMA_YAW_OFFSET
      );
    },
    [selectedLayerMap, panoramaHeading]
  );

  // Restore the data-driven heading when the selection (and thus its map)
  // changes or the box unmounts; we overrode icon-rotate to a constant above.
  useEffect(() => {
    if (!selectedLayerMap) return;
    return () => {
      if (
        typeof selectedLayerMap.getLayer === "function" &&
        selectedLayerMap.getLayer(PANORAMA_SELECTION_ARROW_LAYER)
      ) {
        selectedLayerMap.setLayoutProperty(
          PANORAMA_SELECTION_ARROW_LAYER,
          "icon-rotate",
          ["get", "heading"]
        );
      }
    };
  }, [selectedLayerMap]);

  if (loadingFeatureInfo && shouldRenderLoadingInfobox)
    return <LoadingInfoBox />;

  if (!selectedFeature) {
    return null;
  }

  const featureHeaders = secondaryInfoBoxElements.map((feature, i) => {
    return (
      <div
        style={{
          width: "340px",
          paddingBottom: 3,
          paddingLeft: 10 + i * 10,
          cursor: "pointer",
        }}
        key={"overlapping."}
        onClick={() => {
          dispatch(setSelectedFeature(feature));
          dispatch(updateSecondaryInfoBoxElements(feature));
          dispatch(setPreferredLayerId(feature.id));
          if (feature.vectorId) {
            dispatch(setPreferredVectorLayerId(feature.vectorId));
          } else {
            dispatch(setPreferredVectorLayerId(undefined));
          }
        }}
      >
        <InfoBoxHeader
          content={
            feature.properties.header ||
            feature.properties._header ||
            "Informationen"
          }
          headerColor={"grey"}
          properties={feature.properties.sourceProps}
        ></InfoBoxHeader>
      </div>
    );
  });

  const Modal = additionalInfoFactory(
    selectedFeature?.properties?.ffmodal ?? selectedFeature?.properties?.modal
  );

  if (!headerColor) {
    return <></>;
  }

  const panoramaElements = selectedFeature.properties.panorama
    ? [
        <PanoramaPreview
          key="infobox-panorama-preview"
          src={selectedFeature.properties.panorama}
          onExpand={() => setOpenPanorama(true)}
          // Only the active viewer drives the map arrow; yield to the
          // fullscreen lightbox while it is open.
          onYawChange={openPanorama ? undefined : handlePanoramaYaw}
        />,
      ]
    : [];

  const visibleSecondaryInfoBoxElements =
    selectedFeature.properties.foto || selectedFeature.properties.fotos
      ? [
          ...additionalSecondaryInfoBoxElements,
          ...featureHeaders,
          ...panoramaElements,
          <InfoBoxFotoPreview
            currentFeature={selectedFeature}
            lightBoxDispatchContext={lightBoxDispatchContext}
            urlManipulation={updateUrl}
          />,
        ]
      : [
          ...additionalSecondaryInfoBoxElements,
          ...featureHeaders,
          ...panoramaElements,
        ];

  return (
    <>
      <InfoBox
        pixelwidth={350}
        currentFeature={selectedFeature}
        hideNavigator={true}
        {...selectedFeature?.properties}
        headerColor={headerColor}
        title={
          selectedFeature?.properties?.title?.includes("undefined")
            ? undefined
            : selectedFeature?.properties?.title
        }
        noCurrentFeatureTitle={
          infoText
            ? infoText
            : numOfLayers > 0
            ? "Auf die Karte klicken um Informationen abzurufen"
            : "Layer hinzufügen um Informationen abrufen zu können"
        }
        header={
          parsedHeader && isHtmlString(parsedHeader) ? (
            parsedHeader
          ) : (
            <div
              className="w-full"
              style={{
                backgroundColor: headerColor,
              }}
            >
              {parsedHeader
                ? truncateString(parsedHeader, 66)
                : "Informationen"}
            </div>
          )
        }
        noCurrentFeatureContent=""
        secondaryInfoBoxElements={visibleSecondaryInfoBoxElements}
        links={links}
      />
      {open && Modal && (
        <Modal
          setOpen={() => setOpen(false)}
          feature={
            selectedFeature.properties.sourceProps?.properties ||
            selectedFeature.properties.sourceProps?.targetProperties
              ? selectedFeature.properties.sourceProps
              : { properties: selectedFeature.properties.sourceProps }
          }
          versionString={getApplicationVersion(versionData)}
          Footer={genericSecondaryInfoFooterFactory({
            skipTeilzwilling: true,
            isTopicMap: false,
          })}
          skipTeilzwilling={true}
        />
      )}
      {openPanorama && selectedFeature.properties.panorama && (
        <PanoramaLightBox
          src={selectedFeature.properties.panorama}
          title={selectedFeature.properties.title}
          onClose={() => setOpenPanorama(false)}
          onYawChange={handlePanoramaYaw}
        />
      )}
    </>
  );
};

export default FeatureInfoBox;
