import { MODES } from "react-cismap/topicmaps/ResponsiveInfoBox";
import { useSelector } from "react-redux";
import {
  getFeatureCollection,
  getSelectedFeatureIndex,
} from "../../../store/slices/mapping";
import Color from "color";
import {
  getColorForHauptnutzung,
  getLinkFromAEV,
} from "../../../utils/FnpHelper";
import { ResponsiveInfoBox } from "@carma-apps/portals";

const HN9999Info = () => {
  const features = useSelector(getFeatureCollection);
  const selectedFeatureIndex = useSelector(getSelectedFeatureIndex);
  const selectedFeature = features[selectedFeatureIndex];

  // header background color
  const headerBackgroundColor = Color(getColorForHauptnutzung(selectedFeature));

  // text color for header
  let textColor = "black";
  if (headerBackgroundColor.isDark()) {
    textColor = "white";
  }

  // gather props from feature
  const seeAlsoAev = selectedFeature.properties.siehe_auch_aev;
  const bplanNr = selectedFeature.properties.bplan_nr;
  const bemArr = selectedFeature.properties.bem.split("+");
  // bemArr: [0] (?), [1] n.?, [2] text, [3] suggested main usage (?)
  const infoTextRaw = bemArr[2]?.trim() || "";

  let infoText = infoTextRaw;

  // area display
  if (selectedFeature.properties.area > 0) {
    infoText = (
      <div>
        <span>{infoTextRaw} </span>
        <span style={{ whiteSpace: "nowrap" }}>
          ({(selectedFeature.properties.area + "").replace(".", ",")} ha)
        </span>
      </div>
    );
  } else if (selectedFeature.properties.area === 0) {
    infoText = (
      <div>
        <span>{infoTextRaw} </span>
        <span style={{ whiteSpace: "nowrap" }}>({"<"} 0,1 ha)</span>
      </div>
    );
  }

  // link from aev
  let sieheAuchLinks;
  if (seeAlsoAev !== undefined) {
    sieheAuchLinks = getLinkFromAEV({
      aevs: seeAlsoAev,
      skipStatus: true,
    });
  }

  const ursprLegende = (
    <div>
      Gemäß den Verfügungen der Bezirksregierung Düsseldorf vom 14.10. und
      02.12.2004 von der Genehmigung nach § 6 BauGB ausgenommene Darstellungen (
      <b>Nr. {bemArr[1]?.trim()}</b>)
    </div>
  );

  // Link base (change if needed)
  const bplanBaseUrl = import.meta.env.VITE_BPLAN_BASEURL || "";

  // the content for the "expanded" view
  const divWhenLarge = (
    <div style={{ padding: 0 }}>
      {/* Title: smaller font */}
      <h4 style={{ wordWrap: "break-word", fontSize: "1.25rem" }}>
        {infoText}
      </h4>
      <p>{ursprLegende}</p>
      {/* siehe_auch_aev */}
      {sieheAuchLinks !== undefined && (
        <p>
          <b>s. auch:</b>{" "}
          {sieheAuchLinks.length > 1 &&
            sieheAuchLinks.map((comp, index) => {
              if (index < sieheAuchLinks.length - 1) {
                return <span key={index}>{comp}, </span>;
              } else {
                return (
                  <span key={index}>{comp} (jeweils nicht rechtswirksam)</span>
                );
              }
            })}
          {sieheAuchLinks.length === 1 &&
            sieheAuchLinks.map((comp, index) => {
              return <span key={index}>{comp} (nicht rechtswirksam)</span>;
            })}
        </p>
      )}
      {/* bplan link */}
      {bplanNr !== undefined && (
        <p>
          <b>Anlass:</b>{" "}
          <b>
            <a
              href={bplanBaseUrl + "/#/docs/" + bplanNr + "/1/1"}
              target="_bplaene"
              rel="noreferrer"
            >
              B-Plan {bplanNr}
            </a>
          </b>
        </p>
      )}
    </div>
  );

  // the content for the "collapsed" view
  const divWhenCollapsed = (
    <div style={{ paddingLeft: 0, paddingRight: 0 }}>
      <div style={{ paddingTop: 0, paddingBottom: 0 }}>
        {/* Title: smaller font */}
        <h4 style={{ margin: 0, fontSize: "1.25rem" }}>{infoText}</h4>
      </div>
    </div>
  );

  // the header element
  const llVis = (
    <table style={{ width: "100%" }}>
      <tbody>
        <tr>
          <td
            style={{
              textAlign: "left",
              verticalAlign: "top",
              background: headerBackgroundColor.toString(),
              color: textColor,
              opacity: "0.9",
              paddingLeft: "3px",
              paddingTop: "0px",
              paddingBottom: "0px",
            }}
          >
            nicht genehmigte Darstellung
          </td>
        </tr>
      </tbody>
    </table>
  );

  return (
    <ResponsiveInfoBox
      // Thinner border and optional rounding
      pixelwidth={380}
      panelClick={() => {}}
      header={llVis}
      mode={MODES.AB}
      divWhenLarge={divWhenLarge}
      divWhenCollapsed={divWhenCollapsed}
    />
  );
};

export default HN9999Info;
