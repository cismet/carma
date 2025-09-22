import { useContext, useEffect, useState, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";

import { isEqual } from "lodash";
import envelope from "@turf/envelope";

// import InfoBox from "react-cismap/topicmaps/InfoBox";
import InfoBoxFotoPreview from "react-cismap/topicmaps/InfoBoxFotoPreview";
import { getActionLinksForFeature } from "react-cismap/tools/uiHelper";
import InfoBoxHeader from "react-cismap/topicmaps/InfoBoxHeader";
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
import { getCoordinates } from "../GeoportalMap/topicmap.utils";
import { truncateString, updateUrlWithCoordinates } from "./featureInfoHelper";

import "../infoBox.css";
import LoadingInfoBox from "./LoadingInfoBox";

import versionData from "../../../version.json";
import { getApplicationVersion } from "@carma-commons/utils";
import { InfoBox, utils } from "@carma-appframeworks/portals";
import { parseColor, parseHeader } from "../../helper/color";

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

  if (selectedFeature && canZoomToFeature(selectedFeature)) {
    links = getActionLinksForFeature(selectedFeature, {
      displaySecondaryInfoAction: !!selectedFeature?.properties?.modal,
      setVisibleStateOfSecondaryInfo: () => {
        setOpen(true);
      },
      displayZoomToFeature: true,
      zoomToFeature: () => {
        utils.zoomToFeature(selectedFeature, routedMapRef, [60, 60]);
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
      if (selectedFeature?.properties?.header) {
        const header = await parseHeader(
          selectedFeature.properties.header,
          selectedFeature.properties.wmsProps ?? {}
        );
        setParsedHeader(header || "Informationen");
      } else {
        setParsedHeader("Informationen");
      }

      // Parse header color
      if (selectedFeature?.properties?.headerColor) {
        const color = await parseColor(
          selectedFeature.properties.headerColor,
          selectedFeature.properties.wmsProps ?? {}
        );
        setHeaderColor(color || "#0078a8");
      } else {
        setHeaderColor("#0078a8");
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
          content={feature.properties.header}
          headerColor={"grey"}
        ></InfoBoxHeader>
      </div>
    );
  });

  const Modal = additionalInfoFactory(selectedFeature?.properties?.modal);

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
          <div
            className="w-full"
            style={{
              backgroundColor: selectedFeature?.properties.headerColor
                ? selectedFeature.properties.headerColor
                : "#0078a8",
            }}
          >
            {parsedHeader ? truncateString(parsedHeader, 66) : "Informationen"}
          </div>
        }
        noCurrentFeatureContent=""
        secondaryInfoBoxElements={
          selectedFeature.properties.foto || selectedFeature.properties.fotos
            ? [
                ...featureHeaders,
                <InfoBoxFotoPreview
                  currentFeature={selectedFeature}
                  lightBoxDispatchContext={lightBoxDispatchContext}
                />,
              ]
            : featureHeaders
        }
        links={links}
      />
      {open && Modal && (
        <Modal
          setOpen={() => setOpen(false)}
          feature={{
            properties: selectedFeature.properties.wmsProps,
          }}
          versionString={getApplicationVersion(versionData)}
          Footer={genericSecondaryInfoFooterFactory({ skipTeilzwilling: true })}
          skipTeilzwilling={true}
        />
      )}
    </>
  );
};

export default FeatureInfoBox;
