import { useContext } from "react";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import { FeatureCollectionContext } from "react-cismap/contexts/FeatureCollectionContextProvider";

import { CACHE_JWT } from "react-cismap/tools/fetching";

const Title = ({ logout, jwt }) => {
  const { windowSize } = useContext(ResponsiveTopicMapContext);
  const { metaInformation } = useContext(FeatureCollectionContext);
  let dateInfo;
  if (metaInformation) {
    const t = metaInformation.time;
    const d = new Date(t);
    dateInfo = d.toLocaleString();
  }

  let secondaryInfo, jwtPayload, actiontext;
  if (jwt === CACHE_JWT) {
    secondaryInfo = "Daten aus dem Cache"; //;+ metaInformation.time;
    actiontext = "anmelden und Daten aktualisieren";
  } else {
    try {
      jwtPayload = atob(jwt.split(".")[1]);
      secondaryInfo = JSON.parse(jwtPayload).sub;
      actiontext = "abmelden";
    } catch (e) {}
  }
  /*eslint jsx-a11y/anchor-is-valid: "off"*/
  const titleContent = (
    <div>
      <b>Umweltalarm</b> ({secondaryInfo + (dateInfo !== undefined ? ", " + dateInfo : "")})
      <div style={{ float: "right", paddingRight: 10 }}>
        <a
          style={{ color: "#337ab7" }}
          onClick={() => {
            logout();
          }}
        >
          {/* <FontAwesomeIcon icon={faRandom} style={{ marginRight: 5 }} /> */}
          {actiontext}
        </a>
      </div>
    </div>
  );

  return (
    <table
      style={{
        width: (windowSize?.width || 300) - 54 - 12 - 38 - 12 + "px",
        height: "30px",
        position: "absolute",
        left: 54,
        top: 12,
        zIndex: 555,
      }}
    >
      <tbody>
        <tr>
          <td
            style={{
              textAlign: "center",
              verticalAlign: "middle",
              background: "#ffffff",
              color: "black",
              opacity: "0.9",
              paddingLeft: "10px",
            }}
          >
            {titleContent}
          </td>
        </tr>
      </tbody>
    </table>
  );
};

export default Title;
