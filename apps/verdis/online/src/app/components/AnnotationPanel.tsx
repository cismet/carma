import React, { useRef, useEffect } from "react";
import { getArea25832 } from "../../utils/kassenzeichenMappingTools";
import {
  faEdit,
  faDrawPolygon,
  faMapMarker,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon as Icon } from "@fortawesome/react-fontawesome";
import {
  colorChanged,
  colorDraft,
  colorUnchanged,
} from "../../utils/kassenzeichenHelper";
import { useDispatch, useSelector } from "react-redux";
import {
  fitFeatureBounds,
  getMapping,
  setSelectedFeatureIndexWithSelector,
} from "../../store/slices/mapping";
import scrollIntoView from "scroll-into-view-if-needed";
import type { UnknownAction } from "redux";

interface AnnotationPanelProps {
  annotationFeature: any;
  selected?: boolean;
  editmode?: boolean;
  showEditAnnoMenu?: () => void;
  showEverything?: boolean;
}
const AnnotationPanel = ({
  annotationFeature,
  editmode = true,
  selected,
  showEditAnnoMenu,
  //   clickHandler = () => {},
  showEverything = false,
}: AnnotationPanelProps) => {
  const panelRef = useRef(null);
  const mapping = useSelector(getMapping);
  const dispatch = useDispatch();
  useEffect(() => {
    if (selected && panelRef.current) {
      scrollIntoView(panelRef.current, {
        behavior: "smooth",
        scrollMode: "if-needed",
      });
    }
  }, [selected]);

  const isFlaecheSelected = (flaeche) => {
    return (
      mapping.featureCollection !== "undefined" &&
      mapping.featureCollection.length > 0 &&
      mapping.selectedIndex !== "undefined" &&
      mapping.featureCollection.length > mapping.selectedIndex &&
      mapping.featureCollection[mapping.selectedIndex] &&
      mapping.featureCollection[mapping.selectedIndex]?.properties.id ===
        flaeche.id
    );
  };

  const featureClick = (event) => {
    const feature = mapping.featureCollection.find((feature) => {
      return feature.properties.id === aFeature.id;
    });

    if (isFlaecheSelected(feature.properties)) {
      dispatch(
        fitFeatureBounds(
          mapping.featureCollection[mapping.selectedIndex],
          ""
        ) as unknown as UnknownAction
      );
    } else {
      dispatch(
        setSelectedFeatureIndexWithSelector((testFeature) => {
          return testFeature.properties.id === feature.properties.id;
        }) as unknown as UnknownAction
      );
    }
  };

  const aFeature = JSON.parse(JSON.stringify(annotationFeature));
  aFeature.crs = {
    type: "name",
    properties: { name: "urn:ogc:def:crs:EPSG::25832" },
  };

  const editButtonColor = colorChanged;
  const color = colorChanged;
  const anmerkungsTitleColor = colorUnchanged;

  let borderStyle = "solid";
  let borderColor = "";

  if (annotationFeature.properties.draft === true) {
    borderStyle = "solid";
    borderColor = colorDraft;
  }

  if (selected === true) {
    borderStyle = "solid";
    borderColor = colorChanged;
  } else {
    borderStyle = "solid";
    borderColor = "#ffffff00";
  }

  const styleOverride = {
    marginBottom: "5px",
    // padding: "4px",
    width: "100%",
    height: "100%",
    borderStyle: borderStyle,
    borderColor: borderColor,
    borderWidth: 3,
    borderRadius: 3,
    padding: 9,
  };

  const geomType = aFeature.geometry.type;
  const area = getArea25832(aFeature);

  const secondaryInfo =
    geomType === "Polygon" ? (
      <span>
        <Icon style={{ color: "#999" }} icon={faDrawPolygon} /> ~{" "}
        {Math.round(area)} m²
      </span>
    ) : (
      <Icon style={{ color: "#999" }} icon={faMapMarker} />
    );

  const content = showEverything ? aFeature.properties.text : secondaryInfo;

  return (
    <div ref={panelRef} onClick={featureClick}>
      <div
        className="gradient-bg-for-cards"
        style={{
          ...styleOverride,
          // minHeight: 20,
          // backgroundColor: "#f5f5f5",
          // border: "3px solid #e3e3e3",
          // padding: 9,
          // borderRadius: 3,
          backgroundColor: "#f5f5f5",
        }}
      >
        <table style={{ width: "100%" }}>
          <tbody>
            <tr>
              <td>
                <b style={{ color }}>
                  Anmerkung {annotationFeature.properties.name}{" "}
                  {showEverything && <span>({secondaryInfo})</span>}
                </b>
              </td>
              <td style={{ textAlign: "right" }} />
              {showEditAnnoMenu && editmode && (
                <td
                  style={{
                    textAlign: "right",
                    color: editButtonColor,
                    cursor: "pointer",
                  }}
                >
                  <Icon
                    onClick={(e) => {
                      showEditAnnoMenu();
                      e.stopPropagation();
                    }}
                    icon={faEdit}
                  />
                </td>
              )}
            </tr>
            <tr>
              <td style={{ color: anmerkungsTitleColor }}>{content}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AnnotationPanel;
