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
import {
  faRightFromBracket,
  faTrain,
} from "@fortawesome/free-solid-svg-icons";

import {
  InfoBoxFotoPreview,
  LightBoxContext,
  LightBoxDispatchContext,
  defaultLightBoxCaptionFactory,
} from "@carma-mapping/lightbox";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import { useLibreContext } from "@carma-mapping/contexts";
import {
  resolveInfoBoxImageUrl,
  useAddonState,
  useVehicleAnimationActions,
} from "@carma-mapping/addons";

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
  getOverlappingFeatures,
  findOverlappingIndex,
} from "../../store/slices/features";
import { getLayers } from "../../store/slices/mapping";
import { VEHICLE_FEATURE_ID } from "../../hooks/useVehicleAnimationInfoBox";
import { truncateString } from "./featureInfoHelper";

import "../infoBox.css";
import LoadingInfoBox from "./LoadingInfoBox";
import { useHighlightedFoto } from "./useHighlightedFoto";
import HighlightFotoOverlayPreview from "./HighlightFotoOverlayPreview";

import versionData from "../../../version.json";
import {
  getApplicationVersion,
  isHtmlString,
  updateUrl,
} from "@carma-commons/utils";
import {
  CarmaIconLink,
  InfoBox,
  InfoBoxHeader,
  utils,
  getActionLinksForFeature,
} from "@carma-appframeworks/portals";
import { parseColor } from "../../helper/color";
import { useFeatureFlags } from "@carma-providers/feature-flag";
import { addCustomFeatureFlags } from "../../store/slices/layers";
import type { FeatureInfo } from "@carma-mapping/utils";
import { selectionPadding } from "../../constants/selection";
import { usePanoramaSelection } from "./usePanoramaSelection";

// Opacity of the preview boxes above the infobox (photo, panorama), as a style
// declares it in metadata.carmaConf.infoBox.previewOpacity (0..1), e.g. the
// Kaiserhöhe: { "previewOpacity": 1 }. Undefined keeps the default look
// (boxes at 0.9, a photo preview dimmed once more inside its box).
const readPreviewOpacity = (conf: unknown): number | undefined => {
  const value = (conf as { infoBox?: { previewOpacity?: unknown } } | undefined)
    ?.infoBox?.previewOpacity;
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : undefined;
};

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
  const {
    renderer: vehicleRenderer,
    isRiding: isRidingVehicle,
    setRiding: setRidingVehicle,
  } = useVehicleAnimationActions();
  const previewOpacity = useMemo(
    () =>
      readPreviewOpacity(
        layers.find((l) => l.id === selectedFeature?.id)?.conf
      ),
    [layers, selectedFeature?.id]
  );
  const infoText = useSelector(getInfoText);
  const lightBoxDispatchContext = useContext(LightBoxDispatchContext);
  const lightBoxState = useContext(LightBoxContext);

  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  const { map: libreMap } = useLibreContext();
  // zoom-dependent replacement image, published by the infoBoxZoomImage addon
  const [infoBoxImage] = useAddonState("infoBoxImage");
  // the InfoBox mapping can mark a box on the photo (fotoHighlight, pixel
  // coordinates), e.g. the clicked crack on the crack detection photo. The
  // preview lays it over the photo as SVG (instant); the lightbox gets a
  // canvas-rendered copy that is prepared in the background meanwhile.
  const fotoHighlight = selectedFeature?.properties?.fotoHighlight;
  const fotoHighlightColor =
    selectedFeature?.properties?.fotoHighlightColor ??
    selectedFeature?.properties?.headerColor;

  const originalFotoUrl = updateUrl(selectedFeature?.properties?.foto);
  const highlightedFotoUrl = useHighlightedFoto(
    originalFotoUrl,
    fotoHighlight,
    fotoHighlightColor
  );

  // Overlapping features of one source under the click (e.g. stacked cracks):
  // the infobox navigator steps through them.
  const overlappingFeatures = useSelector(getOverlappingFeatures);
  const overlappingIndex = findOverlappingIndex(
    overlappingFeatures,
    selectedFeature
  );

  const selectOverlapping = useCallback(
    (index: number) => {
      const count = overlappingFeatures.length;
      if (count < 2) {
        return;
      }
      dispatch(
        setSelectedFeature(overlappingFeatures[(index + count) % count])
      );
    },
    [overlappingFeatures, dispatch]
  );

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
          libreMap: libreMap ?? undefined,
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

  // A Schwebebahn car of the 3D fleet: the only action is riding along, and
  // during the ride only leaving it again
  if (
    selectedFeature?.id === VEHICLE_FEATURE_ID &&
    vehicleRenderer === "three"
  ) {
    links = [
      <CarmaIconLink
        key="vehicle-ride"
        tooltip={isRidingVehicle ? "Fahrt beenden" : "Mitfahren"}
        onClick={() => setRidingVehicle(!isRidingVehicle)}
        icon={isRidingVehicle ? faRightFromBracket : faTrain}
      />,
    ];
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

  // the selected panorama: map arrow, hops, lightbox and popout
  const panoramaElements = usePanoramaSelection();
  const lightboxVisible = !!lightBoxState?.visible;

  // The highlight photo's lightbox holds the photo with the box drawn in and
  // the original, paged with the lightbox arrows. Until the boxed copy is
  // rendered (or when that fails) it holds only the original.
  const highlightLightBoxRef = useRef(false);
  const highlightPhotoUrls = (
    highlightedFotoUrl ? [highlightedFotoUrl, originalFotoUrl] : [originalFotoUrl]
  ).filter((url): url is string => !!url);
  const highlightPhotoUrlsKey = highlightPhotoUrls.join("\n");
  const lightBoxIndex = lightBoxState?.index ?? 0;
  const featureTitle = selectedFeature?.properties?.title ?? "";
  const highlightTitle = highlightedFotoUrl
    ? `${featureTitle} (${
        lightBoxIndex === 1 ? "Originalfoto" : "mit Markierung"
      })`
    : featureTitle;

  const openHighlightLightBox = useCallback(() => {
    highlightLightBoxRef.current = true;
    lightBoxDispatchContext?.setAll({
      title: highlightTitle,
      photourls: highlightPhotoUrlsKey.split("\n"),
      caption: defaultLightBoxCaptionFactory(),
      index: 0,
      visible: true,
    });
  }, [lightBoxDispatchContext, highlightTitle, highlightPhotoUrlsKey]);

  // swap in the boxed copy once rendered, and name the version shown
  useEffect(() => {
    if (!lightboxVisible) {
      highlightLightBoxRef.current = false;
      return;
    }
    if (!highlightLightBoxRef.current) {
      return;
    }
    lightBoxDispatchContext?.setPhotoUrls(highlightPhotoUrlsKey.split("\n"));
    lightBoxDispatchContext?.setTitle(highlightTitle);
  }, [
    lightboxVisible,
    highlightPhotoUrlsKey,
    highlightTitle,
    lightBoxDispatchContext,
  ]);

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

  // a feature without a photo of its own only gets one when the route's
  // infoBoxZoomImage addon sets showOnFeaturesWithoutPhoto
  const zoomImageUrl = resolveInfoBoxImageUrl(
    infoBoxImage,
    selectedFeature,
    !!selectedFeature.properties.foto
  );


  const showsHighlightFoto =
    !!fotoHighlight && !!selectedFeature.properties.foto && !zoomImageUrl;
  const overlappingCycle =
    overlappingIndex >= 0
      ? {
          index: overlappingIndex,
          count: overlappingFeatures.length,
          onPrevious: () => selectOverlapping(overlappingIndex - 1),
          onNext: () => selectOverlapping(overlappingIndex + 1),
        }
      : undefined;
  // A panorama's photos are stepped through in its own preview, so they get
  // no separate photo preview (a route's zoom image still does).
  const photosInPanoramaPreview =
    !!selectedFeature.properties.panorama && !zoomImageUrl;

  const visibleSecondaryInfoBoxElements =
    !photosInPanoramaPreview &&
    (selectedFeature.properties.foto ||
      selectedFeature.properties.fotos ||
      zoomImageUrl)
      ? [
          ...additionalSecondaryInfoBoxElements,
          ...featureHeaders,
          ...panoramaElements,
          showsHighlightFoto ? (
            <HighlightFotoOverlayPreview
              key={selectedFeature.properties.foto}
              url={originalFotoUrl}
              highlight={fotoHighlight}
              color={fotoHighlightColor}
              onOpenLightBox={openHighlightLightBox}
              // the configured opacity sits on the surrounding box alone
              {...(previewOpacity !== undefined ? { opacity: 1 } : {})}
            />
          ) : (
            <InfoBoxFotoPreview
              currentFeature={selectedFeature}
              lightBoxDispatchContext={lightBoxDispatchContext}
              urlManipulation={updateUrl}
              {...(previewOpacity !== undefined ? { opacity: 1 } : {})}
              {...(zoomImageUrl ? { getPhotoUrl: () => zoomImageUrl } : {})}
            />
          ),
        ]
      : [
          ...additionalSecondaryInfoBoxElements,
          ...featureHeaders,
          ...panoramaElements,
        ];

  return (
    <>
      <InfoBox
        // the one control a ride keeps besides its own, as the way out
        keepVisible={isRidingVehicle}
        secondaryInfoBoxElementsOpacity={previewOpacity}
        pixelwidth={350}
        currentFeature={selectedFeature}
        hideNavigator={!overlappingCycle}
        {...(overlappingCycle
          ? {
              previous: overlappingCycle.onPrevious,
              next: overlappingCycle.onNext,
              navigatorTitle: `${overlappingCycle.count} überlagernde Risse an dieser Stelle`,
              currentlyShownCountLabel: `${overlappingCycle.index + 1} / ${
                overlappingCycle.count
              }`,
            }
          : {})}
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
    </>
  );
};

export default FeatureInfoBox;
