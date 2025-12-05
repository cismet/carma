import { useContext, useEffect, useState, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";

import InfoBoxFotoPreview from "react-cismap/topicmaps/InfoBoxFotoPreview";
import { getActionLinksForFeature } from "react-cismap/tools/uiHelper";
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
import { getLayers } from "../../store/slices/mapping";
import { truncateString } from "./featureInfoHelper";

import "../infoBox.css";
import LoadingInfoBox from "./LoadingInfoBox";

import versionData from "../../../version.json";
import {
  getApplicationVersion,
  isHtmlString,
  updateUrl,
} from "@carma-commons/utils";
import { InfoBox, InfoBoxHeader, utils } from "@carma-appframeworks/portals";
import { parseColor } from "../../helper/color";
import { useFeatureFlags } from "@carma-providers/feature-flag";
import { addCustomFeatureFlags } from "../../store/slices/layers";

interface InfoBoxProps {
  pos?: [number, number];
}

const FeatureInfoBox = ({ pos }: InfoBoxProps) => {
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
  const infoText = useSelector(getInfoText);
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
      selectedFeature.properties?.wmsProps?.bounds ||
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
        utils.zoomToFeature(
          selectedFeature,
          routedMapRef.leafletMap.leafletElement,
          [60, 60]
        );
      },
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
    if (selectedFeature && selectedFeature.properties.wmsProps) {
      console.log("feature properties:", selectedFeature.properties.wmsProps);
    }

    const updateHeaderAndColor = async () => {
      // Parse header if it exists
      if (selectedFeature?.properties?._header) {
        const header = await utils.parseHeader(
          selectedFeature.properties._header,
          selectedFeature.properties.wmsProps ?? {}
        );
        setParsedHeader(header || "Informationen");
      } else {
        setParsedHeader(selectedFeature?.properties?.header || "Informationen");
      }

      // Parse header color
      if (selectedFeature?.properties?.accentColor) {
        const color = await parseColor(
          selectedFeature.properties.accentColor,
          selectedFeature.properties.wmsProps ?? {}
        );
        setHeaderColor(color || "#0078a8");
      } else {
        setHeaderColor(selectedFeature?.properties?.headerColor || "#0078a8");
      }
    };

    updateHeaderAndColor();
  }, [selectedFeature]);

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
          content={feature.properties.header || feature.properties._header}
          headerColor={"grey"}
          properties={feature.properties.wmsProps}
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
        secondaryInfoBoxElements={
          selectedFeature.properties.foto || selectedFeature.properties.fotos
            ? [
                ...featureHeaders,
                <InfoBoxFotoPreview
                  currentFeature={selectedFeature}
                  lightBoxDispatchContext={lightBoxDispatchContext}
                  urlManipulation={updateUrl}
                />,
              ]
            : featureHeaders
        }
        links={links}
      />
      {open && Modal && (
        <Modal
          setOpen={() => setOpen(false)}
          feature={
            selectedFeature.properties.wmsProps?.properties ||
            selectedFeature.properties.wmsProps?.targetProperties
              ? selectedFeature.properties.wmsProps
              : { properties: selectedFeature.properties.wmsProps }
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
