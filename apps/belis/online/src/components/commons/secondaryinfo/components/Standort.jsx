import { Col, Descriptions, Row } from "antd";

import { getWebDavUrl } from "../../../../constants/belis";
import { getVCard } from "../../../../core/helper/featureHelper";
import { ivAsterisk } from "../../../../core/helper/secondaryInfoHelper";
import SecondaryInfoPanelSection from "../SecondaryInfoPanelSection";
import {
  addDotThumbnail,
  clearOptionalDescriptionItems,
  getSquaredThumbnails,
  getStrasse,
  getTimelineForEvents,
} from "./helper";

export const getEventsForStandort = (item) => {
  const events = [
    ["elektrische Prüfung" + ivAsterisk(item?.elek_pruefung_iv), item?.elek_pruefung, "M"],
    ["Inbetriebnahme" + ivAsterisk(item?.inbetriebnahme_mast_iv), item?.inbetriebnahme_mast, "M"],
    ["letzte Änderung" + ivAsterisk(item?.letzte_aenderung_iv), item?.letzte_aenderung, "M"],
    ["Mastanstrich" + ivAsterisk(item?.mastanstrich_iv), item?.mastanstrich, "M"],
    ["Mastschutz" + ivAsterisk(item?.mastschutz_iv), item?.mastschutz, "M"],
    [
      "Nächste Prüfung" + ivAsterisk(item?.naechstes_pruefdatum_iv),
      item?.naechstes_pruefdatum,
      "M",
    ],
    ["Revision" + ivAsterisk(item?.revision_iv), item?.revision, "M"],
    [
      "Standsicherheitsprüfung" + ivAsterisk(item?.standsicherheitspruefung_iv),
      item?.standsicherheitspruefung,
      "M",
    ],
  ];

  return events;
};

const getLayout4Standort = ({
  feature,
  jwt,
  dispatch,
  setVisible,
  setIndex,
  showActions = true,
  openLightBox = true,
}) => {
  const item = feature.properties;
  // const item = mastOhneLeuchte;

  const subSections = [];
  const vcard = getVCard(feature);
  const title = vcard.infobox.header;

  const events = getEventsForStandort(item);

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
      <div>Kennziffer {item?.fk_kennziffer?.kennziffer}</div>
      <div>
        <b>Standort:</b>
      </div>
      {getStrasse(item?.fk_strassenschluessel, item?.haus_nr)}
      {item?.plz && (
        <div>
          {item?.plz} Wuppertal {item?.stadtbezirk && " (" + item?.stadtbezirk?.bezirk + ")"}
        </div>
      )}
      {item?.standortangabe && <div>{item?.standortangabe}</div>}
      <br />
      {item?.bemerkungen && (
        <>
          <div>
            <b>Bemerkung:</b>
          </div>
          <div>{item?.bemerkungen}</div>
          <br />
        </>
      )}
    </div>
  );
  subSections.push(
    <SecondaryInfoPanelSection
      key={"mast" + item?.fk_standort?.id}
      bsStyle='warning'
      header={"Mast"}
      extra={showActions && (dispatch, item, "tdta_standort_mast", feature.geometry)}
    >
      <Row>
        <Col span={12}>
          {getStandortDetails({
            standortItem: item,
            docs,
            jwt,
            dispatch,
            columns: { xs: 1, sm: 1, md: 1, lg: 1, xxl: 1 },
            openLightBox,
          })}
        </Col>
        <Col span={12}>{getTimelineForEvents({ events })}</Col>
      </Row>
    </SecondaryInfoPanelSection>
  );

  return { title, mainSection, subSections };
};

export const getStandortDetails = ({
  standortItem,
  docs,
  jwt,
  setIndex,
  setVisible,
  columns = { xs: 1, sm: 1, md: 2, lg: 2, xxl: 3 },
  openLightBox = true,
}) => {
  const standortItems = [
    <Descriptions.Item optionalPredicate={() => true} label='Mastart'>
      {standortItem?.fk_mastart ? standortItem?.fk_mastart.mastart : "Mast ohne Mastart"}
    </Descriptions.Item>,
    <Descriptions.Item label='Anstrichfarbe'>{standortItem?.anstrichfarbe}</Descriptions.Item>,

    <Descriptions.Item label='Masttyp'>{standortItem?.fk_masttyp?.masttyp}</Descriptions.Item>,
    <Descriptions.Item label='Kennziffer'>
      {standortItem?.fk_kennziffer?.beschreibung} ({standortItem?.fk_kennziffer?.kennziffer})
    </Descriptions.Item>,

    <Descriptions.Item label='Klassifizierung'>
      {standortItem?.fk_klassifizierung?.klassifizierung}
    </Descriptions.Item>,
    <Descriptions.Item label='Anlagengruppe'>
      {standortItem?.anlagengruppeObject?.bezeichnung}
    </Descriptions.Item>,
    <Descriptions.Item label='Bemerkungen' span={24}>
      {standortItem?.bemerkungen}
    </Descriptions.Item>,
    <Descriptions.Item label='Anbauten'>{standortItem?.anbauten}</Descriptions.Item>,

    <Descriptions.Item label='Verfahren'>{standortItem?.verfahren}</Descriptions.Item>,
    <Descriptions.Item label='Monteur'>{standortItem?.monteur}</Descriptions.Item>,
    <Descriptions.Item label='Montagefirma'>{standortItem?.montagefirma}</Descriptions.Item>,
    <Descriptions.Item label='Gründung'>{standortItem?.gruendung}</Descriptions.Item>,

    <Descriptions.Item label='Erdung' optionalPredicate={() => standortItem?.erdung === true}>
      {standortItem?.erdung === true ? "Ok" : ""}
    </Descriptions.Item>,
    <Descriptions.Item label='Verrechnungseinheit'>
      {standortItem?.verrechnungseinheit === true ? "Ja" : "Nein"}
    </Descriptions.Item>,
    <Descriptions.Item label='Unterhaltspflicht'>
      {standortItem?.unterhaltspflicht_mast?.unterhalt_mast}
    </Descriptions.Item>,
  ];

  return (
    <>
      <Descriptions column={columns} layout='horizontal' bordered>
        {clearOptionalDescriptionItems(standortItems)}
        {/* {standortItems} */}
      </Descriptions>
      {docs.length > 1 &&
        getSquaredThumbnails({ docs, type: "Standort", jwt, setIndex, setVisible, openLightBox })}
    </>
  );
};

export default getLayout4Standort;
