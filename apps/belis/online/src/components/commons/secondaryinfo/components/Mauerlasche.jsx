import { Col, Row } from "antd";

import { getWebDavUrl } from "../../../../constants/belis";
import { getVCard } from "../../../../core/helper/featureHelper";
import { ivAsterisk } from "../../../../core/helper/secondaryInfoHelper";
import {
  addDotThumbnail,
  getAddImageButton,
  getSquaredThumbnails,
  getStrasse,
  getTimelineForEvents,
} from "./helper";
import { getRSDetailsSection } from "./Leuchte";

export const getEventsForMauerlasche = (item) => {
  const events = [
    ["Erstellung", item?.erstellungsjahr, "M"],
    ["Prüfdatum" + ivAsterisk(item?.pruefdatum_iv), item?.pruefdatum, "M"],
  ];

  return events;
};
const getLayout4Mauerlasche = ({
  feature,
  jwt,
  dispatch,
  setVisible,
  setIndex,
  showActions = true,
  openLightBox = true,
}) => {
  const item = feature.properties;
  const subSections = [];
  const vcard = getVCard(feature);
  const title = vcard.infobox.header;

  const events = getEventsForMauerlasche(item);

  let mainDoc;
  let docs = [];
  let mainSectionStyle = {};
  if (item?.docs && item?.docs[0]) {
    mainDoc = item?.docs[0];
    mainSectionStyle = { minHeight: "250px" };
  }
  docs = item?.docs; //;.splice(1);

  const mainSection = (
    <div style={mainSectionStyle}>
      {mainDoc && (
        <img
          onClick={() => {
            if (openLightBox) {
              setVisible(true);
              setIndex(0);
            }
          }}
          alt='Bild'
          style={{
            paddingLeft: 10,
            paddingRight: 10,
            float: "right",
            paddingBottom: "5px",
            maxHeight: "250px",
            maxWidth: "250px",
          }}
          src={addDotThumbnail(getWebDavUrl(jwt, mainDoc))}
          // width='250'
          // maxHeight='250'
        />
      )}
      <div>
        <h2>{vcard.infobox.title}</h2>
      </div>
      <div>
        <b>Standort:</b>
      </div>
      {getStrasse(item?.fk_strassenschluessel, item?.haus_nr)}
      {item?.plz && (
        <div>
          {item?.plz} Wuppertal {item?.stadtbezirk && " (" + item?.stadtbezirk?.bezirk + ")"}
        </div>
      )}
      {item?.zusaetzliche_standortbezeichnung && (
        <div>{item?.zusaetzliche_standortbezeichnung}</div>
      )}
      <br />
      {item?.bemerkung && (
        <>
          <div>
            <b>Bemerkung:</b>
          </div>
          <div>{item?.bemerkung}</div>
          <br />
        </>
      )}
      {item?.monteur && (
        <>
          <div>
            <b>Monteur:</b>
          </div>
          <div>{item?.monteur}</div>
          <br />
        </>
      )}
      {events && events.length > 0 && (
        <Row>
          <Col span={6}>
            <div>{getTimelineForEvents({ events })}</div>
          </Col>
        </Row>
      )}
      {docs.length > 1 &&
        getSquaredThumbnails({
          docs,
          type: "Mauerlasche",
          jwt,
          setIndex,
          setVisible,
          openLightBox,
        })}

      <div
        style={{
          paddingLeft: 10,
          paddingRight: 20,
          textAlign: "left",
          paddingBottom: "5px",
        }}
      >
        {showActions &&
          showActions &&
          getAddImageButton(dispatch, item, "mauerlasche", feature.geometry)}
      </div>
    </div>
  );

  subSections.push(getRSDetailsSection(item));

  return { title, mainSection, subSections };
};

export default getLayout4Mauerlasche;
