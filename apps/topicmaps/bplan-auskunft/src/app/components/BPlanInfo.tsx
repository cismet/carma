import { useContext } from "react";
import { FeatureCollectionContext } from "react-cismap/contexts/FeatureCollectionContextProvider";
import ResponsiveInfoBox, {
  MODES,
} from "react-cismap/topicmaps/ResponsiveInfoBox";
import InfoBox from "react-cismap/topicmaps/InfoBox";
import { OverlayTrigger, Tooltip } from "react-bootstrap";
import Icon from "react-cismap/commons/Icon";
import { useNavigate } from "react-router-dom";
import Color from "color";
import L from "leaflet";
//import type {TopicMapContext} from 'react-cismap';
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { UIDispatchContext } from "react-cismap/contexts/UIContextProvider";
import { InfoBoxText } from "@carma-collab/wuppertal/bplan-auskunft";

const BPlanInfo = ({
  pixelwidth,
  features,
  selectedIndex,
  setSelectedIndex,
  setFeatures,
}) => {
  const { setAppMenuVisible } = useContext(UIDispatchContext);
  const { routedMapRef } = useContext(TopicMapContext);
  let headertext;
  let headerColor;

  const next = () => {
    let potIndex = selectedIndex + 1;
    if (potIndex >= features.length) {
      potIndex = 0;
    }
    const tmpFeatures = features;
    tmpFeatures.forEach((obj, i) => {
      obj.selected = i === potIndex;
    });
    setFeatures(tmpFeatures);
    setSelectedIndex(potIndex);
  };

  const prev = () => {
    let potIndex = selectedIndex - 1;
    if (potIndex < 0) {
      potIndex = features.length - 1;
    }
    const tmpFeatures = features;
    tmpFeatures.forEach((obj, i) => {
      obj.selected = i === potIndex;
    });
    setFeatures(tmpFeatures);
    setSelectedIndex(potIndex);
  };

  if (features.length < 1) {
    let tmpVis = (
      <table style={{ width: "100%" }}>
        <tbody>
          <tr>
            <td
              style={{
                textAlign: "left",
                verticalAlign: "top",
                color: "black",
                opacity: "0.9",
                backgroundColor: "rgb(245, 245, 245)",
                paddingLeft: "3px",
                paddingTop: "0px",
                paddingBottom: "0px",
              }}
            >
              Aktuell keine Bebauungspl&auml;ne geladen.
            </td>
          </tr>
        </tbody>
      </table>
    );

    return (
      <ResponsiveInfoBox
        pixelwidth={pixelwidth}
        header={tmpVis}
        isCollapsible={false}
        collapsibleDiv={<></>}
        alwaysVisibleDiv={<InfoBoxText setAppMenuVisible={setAppMenuVisible} />}
      ></ResponsiveInfoBox>
    );
  }

  const selectedFeature = features[selectedIndex];

  let status = selectedFeature?.properties.status;

  if (status === "rechtskräftig") {
    headertext = "rechtswirksam";
    headerColor = "#82BB8F"; //'#2AFF00';
  } else if (status === "nicht rechtskräftig") {
    headertext = "nicht rechtswirksam";

    headerColor = "#F48286"; //'#FC0000'
  } else {
  }

  let headerBackgroundColor = Color(headerColor);

  const planTooltip = <Tooltip id="test">PDF Dokument</Tooltip>;

  let llVis = (
    <table style={{ width: "100%" }}>
      <tbody>
        <tr>
          <td
            style={{
              textAlign: "left",
              verticalAlign: "top",
              background: headerColor,
              color: "black",
              opacity: "0.9",
              paddingLeft: "3px",
              paddingTop: "0px",
              paddingBottom: "0px",
            }}
          >
            {headertext}
          </td>
        </tr>
      </tbody>
    </table>
  );

  let divWhenLarge = (
    <div>
      <table border={0} style={{ width: "100%" }}>
        <tbody>
          <tr>
            <td
              style={{
                textAlign: "left",
                verticalAlign: "top",
                padding: "5px",
                maxWidth: "160px",
                overflowWrap: "break-word",
              }}
            >
              <h4>B-Plan {selectedFeature.properties.nummer}</h4>
              <h6>{selectedFeature.properties.name}</h6>
            </td>
            <td
              style={{
                textAlign: "center",
                verticalAlign: "top",
                padding: "5px",
                paddingTop: "1px",
              }}
            >
              <a
                style={{ color: "#333" }}
                href={
                  window.location.origin +
                  window.location.pathname +
                  `/#/docs/${selectedFeature.properties.nummer}/1/1`
                }
                target="doc"
              >
                <h4 style={{ marginLeft: 5, marginRight: 5, fontSize: 36 }}>
                  {/* <font size='30'> */}
                  <OverlayTrigger placement="left" overlay={planTooltip}>
                    <Icon
                      style={{ textDecoration: "none" }}
                      name="file-pdf-o"
                    />
                  </OverlayTrigger>
                  {/* </font> */}
                </h4>
                <OverlayTrigger placement="left" overlay={planTooltip}>
                  <div style={{ fontSize: 16 }}>Dokumente</div>
                </OverlayTrigger>
              </a>
            </td>
          </tr>
        </tbody>
      </table>
      <br />
      <table style={{ width: "100%", color: "#0078A8" }}>
        <tbody>
          <tr>
            <td style={{ textAlign: "left", verticalAlign: "center" }}>
              <a title="vorheriger Treffer" onClick={prev}>
                &lt;&lt;
              </a>
            </td>

            <td style={{ textAlign: "center", verticalAlign: "center" }}>
              <a
                onClick={() => {
                  const projectedFC = L.Proj.geoJson(features);
                  const bounds = projectedFC.getBounds();
                  const map = routedMapRef?.leafletMap?.leafletElement;
                  if (map === undefined) {
                    return;
                  }
                  map.fitBounds(bounds);
                }}
              >
                alle {features.length} Treffer anzeigen
              </a>
            </td>
            <td style={{ textAlign: "right", verticalAlign: "center" }}>
              <a title="nächster Treffer" onClick={next}>
                &gt;&gt;
              </a>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );

  let divWhenCollapsed = (
    <div>
      <table border={0} style={{ width: "100%" }}>
        <tbody>
          <tr>
            <td
              style={{
                textAlign: "left",
                verticalAlign: "top",
                padding: "5px",
                maxWidth: "160px",
                overflowWrap: "break-word",
              }}
            >
              <h4>B-Plan {selectedFeature.properties.nummer}</h4>
            </td>
            <td
              style={{
                textAlign: "center",
                verticalAlign: "center",
                padding: "5px",
                paddingTop: "1px",
              }}
            >
              <a
                style={{ color: "#333" }}
                href={
                  window.location.origin +
                  window.location.pathname +
                  `/#/docs/${selectedFeature.properties.nummer}/1/1`
                }
                target="doc"
              >
                <h4 style={{ marginLeft: 5, marginRight: 5 }}>
                  <OverlayTrigger placement="left" overlay={planTooltip}>
                    <Icon
                      style={{ textDecoration: "none", fontSize: 26 }}
                      name="file-pdf-o"
                    />
                  </OverlayTrigger>
                </h4>
              </a>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );

  return (
    <ResponsiveInfoBox
      pixelwidth={pixelwidth}
      header={llVis}
      mode={MODES.AB}
      divWhenLarge={divWhenLarge}
      divWhenCollapsed={divWhenCollapsed}
    ></ResponsiveInfoBox>
  );
};

export default BPlanInfo;
