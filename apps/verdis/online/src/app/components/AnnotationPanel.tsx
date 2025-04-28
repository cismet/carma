// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
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
import scrollIntoViewIfNeeded from "scroll-into-view-if-needed";

interface AnnotationPanelProps {
  annotationFeature: any;
  selected: boolean;
  editmode: boolean;
  showEditAnnoMenu: boolean;
  showEverything: boolean;
}
const AnnotationPanel = ({
  annotationFeature,
  editmode = true,
  selected,
  showEditAnnoMenu = true,
  //   clickHandler = () => {},
  showEverything = false,
}: AnnotationPanelProps) => {
  const panelRef = useRef(null);
  const mapping = useSelector(getMapping);
  const dispatch = useDispatch();
  useEffect(() => {
    if (selected && panelRef.current) {
      scrollIntoViewIfNeeded(panelRef.current, false, {
        duration: 250,
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
        fitFeatureBounds(mapping.featureCollection[mapping.selectedIndex], "")
      );
    } else {
      dispatch(
        setSelectedFeatureIndexWithSelector((testFeature) => {
          return testFeature.properties.id === feature.properties.id;
        })
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
  let borderColor = "#ffffff00";

  if (annotationFeature.properties.draft === true) {
    borderColor = colorDraft;
  }

  if (selected === true) {
    borderColor = colorChanged;
  } else {
    borderStyle = "solid";
    borderColor = "#ffffff00";
  }

  const styleOverride = {
    marginBottom: "5px",
    width: "100%",
    height: "100%",
    borderStyle,
    borderColor,
    borderWidth: 3,
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
        style={{
          ...styleOverride,
          minHeight: 20,
          backgroundColor: "#f5f5f5",
          border: "1px solid #e3e3e3",
          padding: 9,
          borderRadius: 3,
          height: "auto",
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
