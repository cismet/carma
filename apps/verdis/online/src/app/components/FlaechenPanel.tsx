import { useDispatch, useSelector } from "react-redux";
import {
  colorChanged,
  getProcessedFlaechenCR,
  colorNeededProof,
} from "../../utils/kassenzeichenHelper";
import {
  fitFeatureBounds,
  getMapping,
  setSelectedFeatureIndexWithSelector,
} from "../../store/slices/mapping";
import { useEffect, useRef } from "react";
import scrollIntoView from "scroll-into-view-if-needed";
import { FontAwesomeIcon as Icon } from "@fortawesome/react-fontawesome";
import { faEdit } from "@fortawesome/free-solid-svg-icons";
import { colorDraft } from "../../utils/kassenzeichenHelper";
import type { UnknownAction } from "redux";

interface FlaechenPanelProps {
  flaeche: any;
  selected?: boolean;
  editMode: boolean;
  showEditCRMenu?: () => void;
  display?: string | null;
  flaechenCR?: any;
  proofNeeded?: boolean;
  isAllowClick?: boolean;
}

const FlaechenPanel = ({
  flaeche,
  selected,
  editMode = true,
  showEditCRMenu = () => {},
  display = null,
  flaechenCR,
  proofNeeded = false,
  isAllowClick = true,
}: FlaechenPanelProps) => {
  let background = "";
  let groesse,
    groesseColor = "black",
    anteil,
    anschlussgrad,
    anschlussgradColor = "black",
    flaechenart,
    flaechenartColor = "black",
    editButtonColor;
  let borderStyle = "";
  let borderColor = "";
  const mapping = useSelector(getMapping);
  const dispatch = useDispatch();
  const panelRef = useRef(null);

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
    if (isAllowClick) {
      const feature = mapping.featureCollection.find((feature) => {
        return feature.properties.id === flaeche.id;
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
    }
  };

  if (selected === true) {
    borderStyle = "solid";
    borderColor = colorChanged;
  } else {
    borderStyle = "solid";
    borderColor = "#ffffff00";
  }

  groesse = flaeche.flaecheninfo.groesse_korrektur;
  anteil = flaeche.anteil;
  anschlussgrad = flaeche.flaecheninfo.anschlussgrad.grad_abkuerzung;
  flaechenart = flaeche.flaecheninfo.flaechenart.art;

  if (display && display === "cr") {
    const crInfo = getProcessedFlaechenCR(flaeche, flaechenCR);
    groesse = crInfo.groesse;
    anschlussgrad = crInfo.anschlussgrad.grad_abkuerzung;
    flaechenart = crInfo.art.art;
    groesseColor = crInfo.colors.groesse;
    anschlussgradColor = crInfo.colors.anschlussgrad;
    flaechenartColor = crInfo.colors.flaechenart;

    const colorSelected = colorChanged;

    if (flaechenCR.draft === true) {
      if (selected === true) {
        borderColor =
          colorSelected +
          " " +
          colorDraft +
          " " +
          colorSelected +
          " " +
          colorSelected;
      } else {
        borderColor = proofNeeded ? colorNeededProof : colorDraft;
      }
    }
  }

  let area = <div />;
  if (flaeche.anteil) {
    area = (
      <div style={{ color: groesseColor }}>
        {anteil} m&sup2; von {groesse} m&sup2;
      </div>
    );
  } else {
    area = <div style={{ color: groesseColor }}>{groesse} m&sup2;</div>;
  }

  let beschreibung = <div />;
  if (flaeche.flaecheninfo.beschreibung) {
    beschreibung = <div>{flaeche.flaecheninfo.beschreibung.beschreibung}</div>;
  }

  let styleOverride = {
    marginBottom: "5px",
    // padding: "4px",
    width: "100%",
    height: "100%",
    background: background,
    borderStyle: borderStyle,
    borderColor: borderColor,
    borderWidth: 3,
    borderRadius: 3,
  };

  useEffect(() => {
    if (selected && panelRef.current) {
      scrollIntoView(panelRef.current, {
        behavior: "smooth",
        scrollMode: "if-needed",
      });
    }
  }, [selected]);

  return (
    <div ref={panelRef}>
      <div
        onClick={featureClick}
        className="gradient-bg-for-cards"
        style={{
          ...styleOverride,
          minHeight: 20,
          backgroundColor: "#f5f5f5",
          // border: "1px solid #e3e3e3",
          padding: 9,
          lineHeight: "1.3",
          // borderRadius: 3,
          // height: "auto",
        }}
      >
        <table style={{ width: "100%" }}>
          <tbody>
            <tr>
              <td>
                <b style={{ color: flaechenartColor }}>
                  {flaechenart + " " + flaeche.flaechenbezeichnung}
                </b>
              </td>
              <td style={{ textAlign: "right" }}>{beschreibung}</td>

              {editMode === true && (
                <td
                  style={{
                    textAlign: "right",
                    color: editButtonColor,
                    cursor: "pointer",
                  }}
                >
                  <Icon
                    onClick={(e) => {
                      showEditCRMenu();
                      e.stopPropagation();
                    }}
                    icon={faEdit}
                  />
                </td>
              )}
            </tr>
            <tr>
              <td>{area}</td>
              <td style={{ textAlign: "right", color: anschlussgradColor }}>
                {anschlussgrad}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default FlaechenPanel;
