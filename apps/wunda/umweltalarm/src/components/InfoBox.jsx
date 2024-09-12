import {
  faCity,
  faExclamationCircle,
  faFaucet,
  faHandHoldingWater,
  faIndustry,
  faMap,
  faTree,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useContext } from "react";
import { Button } from "react-bootstrap";
import {
  UIContext,
  UIDispatchContext,
} from "react-cismap/contexts/UIContextProvider";
import ResponsiveInfoBox from "react-cismap/topicmaps/ResponsiveInfoBox";
import Loadable from "react-loading-overlay";

export const modes = {
  WINDOW: "WINDOW",
  CENTER: "CENTER",
};
const InfoBox = ({
  hits,
  mode,
  setFeatureCollectionVisible,
  isFeatureCollectionVisible,
}) => {
  const { collapsedInfoBox } = useContext(UIContext);
  const { setCollapsedInfoBox, setSecondaryInfoVisible } =
    useContext(UIDispatchContext);
  var hitsObject = {};
  var flurstueckDienstStellenAnzahl = 0;

  if (Array.isArray(hits)) {
    for (var el of hits) {
      switch (el.typ) {
        case "trinkwasserbrunnen":
          if (hitsObject.brunnen === undefined) {
            hitsObject.brunnen = [];
          }
          hitsObject.brunnen.push(el);
          break;
        case "bimschNrw":
        case "bimschWuppertal":
          if (hitsObject.bimsch === undefined) {
            hitsObject.bimsch = [];
          }
          hitsObject.bimsch.push(el);
          break;
        case "strassenmeisterei":
          if (hitsObject.strassenmeisterei === undefined) {
            hitsObject.strassenmeisterei = [];
          }
          hitsObject.strassenmeisterei.push(el);
          break;
        case "naturschutzgebiete":
        case "landschaftsschutzgebiete":
          if (hitsObject.schutzgebiete === undefined) {
            hitsObject.schutzgebiete = [];
          }
          hitsObject.schutzgebiete.push(el);
          break;
        case "autobahnmeisterei":
          if (hitsObject.autobahnmeisterei === undefined) {
            hitsObject.autobahnmeisterei = [];
          }
          hitsObject.autobahnmeisterei.push(el);
          break;
        case "wasserschutzgebiete":
          if (hitsObject.wasserschutzgebiete === undefined) {
            hitsObject.wasserschutzgebiete = [];
          }
          hitsObject.wasserschutzgebiete.push(el);
          break;
        case "wasserverbaende":
          if (hitsObject.verbaende === undefined) {
            hitsObject.verbaende = [];
          }
          hitsObject.verbaende.push(el);
          break;
        case "StoerfallBetriebeKlasse1":
        case "StoerfallBetriebeKlasse2":
          if (hitsObject.stoerfallbetriebe === undefined) {
            hitsObject.stoerfallbetriebe = [];
          }
          hitsObject.stoerfallbetriebe.push(el);
          break;
        case "stadtFlurstuecke":
          if (hitsObject.stadtFlurstuecke === undefined) {
            hitsObject.stadtFlurstuecke = [];
          }
          flurstueckDienstStellenAnzahl =
            flurstueckDienstStellenAnzahl + el.dienststellen.split("#").length;
          hitsObject.stadtFlurstuecke.push(el);
          break;
        default:
      }
    }
  }

  const header = (
    <table style={{ width: "100%" }}>
      <tbody>
        <tr>
          <td
            style={{
              textAlign: "left",
              verticalAlign: "top",
              background: "grey",
              color: "black",
              opacity: "0.9",
              paddingLeft: "4px",
              paddingTop: "0px",
              paddingBottom: "0px",
            }}
          >
            <span>
              {" "}
              Analyseergebnis{" "}
              {mode === modes.CENTER ? "(Fadenkreuz)" : "(Kartenfenster)"}:{" "}
              {Array.isArray(hits) ? hits.length : "-"} Treffer
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  );

  let fontSize = 30;
  let activeStyle = {
    border: 0,
    borderStyle: "solid",
    fontSize,
    textAlign: "center",
    flexGrow: 1,
  };
  let inactiveStyle = {
    border: 0,
    borderStyle: "solid",
    fontSize,
    textAlign: "center",
    color: "#dddddd",
    flexGrow: 1,
  };
  let subtextStyle = { fontSize: 12, minHeight: "18px" };

  let gridStyle = {
    display: "grid",
    gridGap: "5px",
    gridTemplateColumns: "repeat(3, 1fr)",
    verticalAlign: "center",
  };
  if (collapsedInfoBox === true) {
    fontSize = 23;
    subtextStyle = { fontSize: 9, minHeight: "15px" };
    gridStyle = {
      display: "flex",
      flexDirection: "row",
      flexWrap: "nowrap",
      justifyContent: "center",
      verticalAlign: "center",
      alignContent: "space-around",
    };
  }

  let symbols = (
    <div
      onClick={() => {
        setSecondaryInfoVisible(true);
      }}
    >
      <Loadable active={hits === undefined} spinner text={"Suchen"}>
        <div style={gridStyle}>
          {/* Trinkwasserbrunnen */}
          <div
            title="Trinkwasserbrunnen"
            style={
              hitsObject?.brunnen !== undefined ? activeStyle : inactiveStyle
            }
          >
            <FontAwesomeIcon style={{ fontSize }} icon={faFaucet} />
            <div style={subtextStyle}>
              {hitsObject?.brunnen !== undefined
                ? hitsObject?.brunnen[0].abstand +
                  " m" +
                  (hitsObject?.brunnen.length > 1
                    ? " (+" + (hitsObject?.brunnen.length - 1) + ")"
                    : "")
                : ""}
            </div>
          </div>
          {/* Autobahnmeisterei */}
          {/* <div style={hitsObject?.autobahnmeisterei !== undefined ? activeStyle : inactiveStyle}>
            <FontAwesomeIcon style={{ fontSize }} icon={faRoad} />
            <div style={subtextStyle}>{(hitsObject?.autobahnmeisterei !== undefined ? hitsObject?.autobahnmeisterei[0].default_name : '')}</div>
          </div> */}
          {/* Straßenmeisterei */}
          {/* <div style={hitsObject?.strassenmeisterei !== undefined ? activeStyle : inactiveStyle}>
            <FontAwesomeIcon style={{ fontSize }} icon={faRoad} />
            <div style={subtextStyle}>{(hitsObject?.strassenmeisterei !== undefined ? hitsObject?.strassenmeisterei[0].default_name : '')}</div>
          </div> */}
          {/* BIMSchG */}
          <div
            title="BImschG-Anlagen"
            style={
              hitsObject?.bimsch !== undefined ? activeStyle : inactiveStyle
            }
          >
            <FontAwesomeIcon style={{ fontSize }} icon={faIndustry} />
            <div style={subtextStyle}>
              {hitsObject?.bimsch !== undefined
                ? (hitsObject?.bimsch[0].typ === "bimschNrw"
                    ? "BRD - "
                    : "UIB - ") +
                  hitsObject?.bimsch[0].abstand +
                  " m" +
                  (hitsObject?.bimsch.length > 1
                    ? " (+" + (hitsObject?.bimsch.length - 1) + ")"
                    : "")
                : ""}
            </div>
          </div>
          {/* Wasserschutzgebiete */}
          <div
            title="Wasserschutzgebiete"
            style={
              hitsObject?.wasserschutzgebiete !== undefined
                ? activeStyle
                : inactiveStyle
            }
          >
            <FontAwesomeIcon style={{ fontSize }} icon={faHandHoldingWater} />
            <div style={subtextStyle}>
              {hitsObject?.wasserschutzgebiete !== undefined
                ? "Zone: " +
                  hitsObject?.wasserschutzgebiete[0].default_name +
                  (hitsObject?.wasserschutzgebiete.length > 1
                    ? " (+" + (hitsObject?.wasserschutzgebiete.length - 1) + ")"
                    : "")
                : ""}
            </div>
          </div>
          {/* Verbände */}
          {/* <div style={hitsObject?.verbaende !== undefined ? activeStyle : inactiveStyle}>
            <FontAwesomeIcon style={{ fontSize }} icon={faWater} />
            <div style={subtextStyle}>
              {hitsObject?.verbaende !== undefined ? hitsObject?.verbaende[0].default_name : ""}
            </div>
          </div> */}
          {/* Störfallbetriebe */}
          <div
            title="Störfallbetriebe"
            style={
              hitsObject?.stoerfallbetriebe !== undefined
                ? activeStyle
                : inactiveStyle
            }
          >
            <FontAwesomeIcon style={{ fontSize }} icon={faExclamationCircle} />
            <div style={subtextStyle}>
              {hitsObject?.stoerfallbetriebe !== undefined
                ? hitsObject?.stoerfallbetriebe[0].default_name +
                  (hitsObject?.stoerfallbetriebe[0].typ ===
                  "StoerfallBetriebeKlasse1"
                    ? "-A1"
                    : "-A2") +
                  (hitsObject?.stoerfallbetriebe.length > 1
                    ? " (+" + (hitsObject?.stoerfallbetriebe.length - 1) + ")"
                    : "")
                : ""}
            </div>
          </div>
          {/* städt. Flurstücke */}
          <div
            title="Städtische Flurstücke"
            style={
              hitsObject?.stadtFlurstuecke !== undefined
                ? activeStyle
                : inactiveStyle
            }
          >
            <FontAwesomeIcon style={{ fontSize }} icon={faCity} />
            <div style={subtextStyle}>
              {hitsObject?.stadtFlurstuecke !== undefined
                ? hitsObject?.stadtFlurstuecke[0].default_name.split("#")[0] +
                  (hitsObject?.stadtFlurstuecke.length > 1
                    ? " (+" + (hitsObject?.stadtFlurstuecke.length - 1) + ")"
                    : "")
                : //                ? hitsObject?.stadtFlurstuecke[0].default_name + (hitsObject?.stadtFlurstuecke.length > 1 ? ' (+' + (hitsObject?.stadtFlurstuecke.length - 1) + ')' : '')
                  ""}
            </div>
          </div>
          {/* Landschafts und Naturschutzgebiete */}
          <div
            title="Landschafts- und Naturschutzgebiete"
            style={
              hitsObject?.schutzgebiete !== undefined
                ? activeStyle
                : inactiveStyle
            }
          >
            <FontAwesomeIcon style={{ fontSize }} icon={faTree} />
            <div style={subtextStyle}>
              {hitsObject?.schutzgebiete !== undefined
                ? (hitsObject?.schutzgebiete[0].typ === "naturschutzgebiete"
                    ? "NSG"
                    : "LSG") +
                  (hitsObject?.schutzgebiete.length > 1
                    ? " (+" + (hitsObject?.schutzgebiete.length - 1) + ")"
                    : "")
                : ""}
            </div>
          </div>
        </div>
      </Loadable>
    </div>
  );
  return (
    <ResponsiveInfoBox
      panelClick={() => {}}
      pixelwidth={300}
      header={header}
      collapsedInfoBox={collapsedInfoBox}
      setCollapsedInfoBox={setCollapsedInfoBox}
      isCollapsible={true}
      collapsibleStyle={{ paddingLeft: 0 }}
      handleResponsiveDesign={true}
      infoStyle={{ padding: "0px" }}
      alwaysVisibleDiv={collapsedInfoBox ? symbols : null}
      collapsibleDiv={!collapsedInfoBox ? symbols : null}
      fixedRow={true}
      secondaryInfoBoxElements={[
        <div>
          <Button
            variant={isFeatureCollectionVisible ? "success" : "secondary"}
            title={
              isFeatureCollectionVisible
                ? "aus Karte ausblenden"
                : "in Karte anzeigen"
            }
            style={{ marginBottom: 5 }}
            onClick={() => {
              setFeatureCollectionVisible(!isFeatureCollectionVisible);
            }}
          >
            <FontAwesomeIcon icon={faMap} />
          </Button>
        </div>,
      ]}
    />
  );
};
export default InfoBox;
