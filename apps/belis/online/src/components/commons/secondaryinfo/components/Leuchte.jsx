import { Col, Descriptions, Row } from "antd";
import React from "react";

import { getWebDavUrl } from "../../../../constants/belis";
import { getVCard } from "../../../../core/helper/featureHelper";

import { ivAsterisk } from "../../../../core/helper/secondaryInfoHelper";

import SecondaryInfoPanelSection from "../SecondaryInfoPanelSection";
import {
  addDotThumbnail,
  clearOptionalDescriptionItems,
  getAddImageButton,
  getSquaredThumbnails,
  getStrasse,
  getTimelineForEvents,
} from "./helper";
import { getEventsForStandort, getStandortDetails } from "./Standort";

export const getEvents4Leuchte = (item) => {
  const events = [
    ["Einbau RS" + ivAsterisk(item?.einbaudatum_iv), item?.einbaudatum, "L"],
    ["Sonderturnus" + ivAsterisk(item?.wartungszyklus_iv), item?.wartungszyklus, "L"],
    ["Nächster Wechsel" + ivAsterisk(item?.naechster_wechsel_iv), item?.naechster_wechsel, "L"],
    [
      "Wechsel Vorschaltgerät" + ivAsterisk(item?.wechselvorschaltgeraet_iv),
      item?.wechselvorschaltgeraet,
      "L",
    ],
    ["Leuchtmittelwechsel" + ivAsterisk(item?.wechseldatum_iv), item?.wechseldatum, "L"],
    [
      "Inbetriebnahme" + ivAsterisk(item?.inbetriebnahme_leuchte_iv),
      item?.inbetriebnahme_leuchte,
      "L",
    ],
    ...getEventsForStandort(item?.fk_standort),
  ];
  return events;
};

const getLayout4Leuchte = ({
  feature,
  jwt,
  dispatch,
  setIndex,
  setVisible,
  showActions = true,
  openLightBox = true,
}) => {
  const item = feature.properties;
  // const item = leuchteMitAllenAttributen;
  const subSections = [];
  const vcard = getVCard(feature);
  const title = vcard.infobox.header;

  const events = getEvents4Leuchte(item);

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
      {getStrasse(item?.fk_strassenschluessel, item?.fk_standort?.haus_nr)}
      {item?.fk_standort?.fk_stadtbezirk && (
        <div>{item?.fk_standort?.fk_stadtbezirk && item?.fk_standort?.fk_stadtbezirk?.bezirk}</div>
      )}
      {item?.plz && <div>{item?.plz} Wuppertal </div>}
      {item?.fk_standort?.standortangabe && <div>{item?.fk_standort?.standortangabe}</div>}
    </div>
  );

  const rsItems = getRSDetailItems(item?.rundsteuerempfaenger);

  let wechselgrund;

  if (item?.lebensdauer) {
    if (item?.lebensdauer === 1) {
      wechselgrund = "Störung" + ivAsterisk(item?.lebensdauer_iv);
    } else if (item?.lebensdauer === 2) {
      wechselgrund = "Wartungsturnus" + ivAsterisk(item?.lebensdauer_iv);
    } else {
      wechselgrund = "sonstiges (" + item?.lebensdauer + ")" + ivAsterisk(item?.lebensdauer_iv);
    }
  }

  const leuchteItems = [
    <Descriptions.Item label='Energielieferant'>
      {item?.fk_energielieferant?.energielieferant}
    </Descriptions.Item>,
    <Descriptions.Item label='Bemerkung'>{item?.bemerkungen}</Descriptions.Item>,

    <Descriptions.Item label='Schaltstelle'>{item?.schaltstelle}</Descriptions.Item>,
    ...(rsItems.length === 1 ? rsItems : []),
    <Descriptions.Item label='Unterhalt'>
      {item?.fk_unterhaltspflicht_leuchte?.unterhaltspflichtiger_leuchte}
    </Descriptions.Item>,
    <Descriptions.Item label='Montagefirma'>{item?.montagefirma_leuchte}</Descriptions.Item>,
    <Descriptions.Item label='Vorschaltgerät'>{item?.vorschaltgeraet}</Descriptions.Item>,
    <Descriptions.Item label='Monteur'>{item?.monteur}</Descriptions.Item>,
    <Descriptions.Item label='Zähler'>
      {item?.zaehler ? "Zähler vorhanden" : "kein Zähler vorhanden"}
    </Descriptions.Item>,
    <Descriptions.Item label='Wechselgrund'>{wechselgrund}</Descriptions.Item>,
  ];

  subSections.push(
    <SecondaryInfoPanelSection
      key={"leuchte" + item?.id}
      bsStyle='success'
      header={"Leuchte und Gesamtverlauf"}
      extra={showActions && getAddImageButton(dispatch, item, "tdta_leuchten", feature.geometry)}
    >
      <Row>
        <Col span={12}>
          <Descriptions
            column={{ xs: 1, sm: 1, md: 1, lg: 1, xxl: 1 }}
            layout='horizontal'
            bordered
          >
            {clearOptionalDescriptionItems(leuchteItems)}
          </Descriptions>

          {getSquaredThumbnails({ docs, type: "Leuchte", jwt, setIndex, setVisible, openLightBox })}
        </Col>
        <Col span={12}>{getTimelineForEvents({ events })}</Col>
      </Row>
    </SecondaryInfoPanelSection>
  );
  if (rsItems.length > 1) {
    subSections.push(getRSDetailsSection(item));
  }

  subSections.push(
    <SecondaryInfoPanelSection key={"dk" + item.id} bsStyle='warning' header={"Doppelkommandos"}>
      {/* Doppelkommandos */}
      <Descriptions column={{ xs: 1, sm: 3, md: 3, lg: 3, xxl: 3 }} layout='horizontal' bordered>
        {item?.fk_dk1 && (
          <>
            <Descriptions.Item label='DK 1'>
              <span title={item?.fk_dk1?.beschreibung}>{item?.fk_dk1?.pk}</span>
            </Descriptions.Item>
            <Descriptions.Item label='Anzahl DK 1'>{item?.anzahl_1dk}</Descriptions.Item>
            <Descriptions.Item label='Anschlussleistung DK 1'>
              {item?.anschlussleistung_1dk} W
            </Descriptions.Item>
          </>
        )}
        {item?.fk_dk2 && (
          <>
            <Descriptions.Item label='DK 2'>
              <span title={item?.fk_dk2?.beschreibung}>{item?.fk_dk2?.pk}</span>
            </Descriptions.Item>
            <Descriptions.Item label='Anzahl DK 2'>{item?.anzahl_2dk}</Descriptions.Item>
            <Descriptions.Item label='Anschlussleistung DK 2'>
              {item?.anschlussleistung_2dk} W
            </Descriptions.Item>
          </>
        )}
      </Descriptions>
    </SecondaryInfoPanelSection>
  );

  const leuchtmittelItem = item?.leuchtmittel;
  if (leuchtmittelItem) {
    const leuchtMittelItems = [
      <Descriptions.Item label='Typ'>{leuchtmittelItem?.hersteller}</Descriptions.Item>,
      <Descriptions.Item label='Lichtfarbe'>{leuchtmittelItem?.lichtfarbe}</Descriptions.Item>,
    ];

    subSections.push(
      <SecondaryInfoPanelSection
        key={"Leuchtmittel" + item.id}
        bsStyle='info'
        header={"Leuchtmittel" + ivAsterisk(item?.leuchtmittel_iv)}
      >
        <Descriptions column={{ xs: 1, sm: 1, md: 2, lg: 2, xxl: 3 }} layout='horizontal' bordered>
          {clearOptionalDescriptionItems(leuchtMittelItems)}
        </Descriptions>
      </SecondaryInfoPanelSection>
    );
  }
  const leuchtTypItem = item?.fk_leuchttyp;

  const leuchtTypItems = [
    <Descriptions.Item label='Bestückung'>{leuchtTypItem?.bestueckung}</Descriptions.Item>,
    <Descriptions.Item label='P Brutto' optionalPredicate={() => leuchtTypItem?.leistung_brutto}>
      {leuchtTypItem?.leistung_brutto} W
    </Descriptions.Item>,
    <Descriptions.Item label='P Netto' optionalPredicate={() => leuchtTypItem?.leistung}>
      {leuchtTypItem?.leistung} W
    </Descriptions.Item>,
    <Descriptions.Item
      label='P Brutto (reduziert)'
      optionalPredicate={() => leuchtTypItem?.leistung_brutto}
    >
      {leuchtTypItem?.leistung_brutto_reduziert} W
    </Descriptions.Item>,
    <Descriptions.Item
      label='P Netto (reduziert)'
      optionalPredicate={() => leuchtTypItem?.leistung}
    >
      {leuchtTypItem?.leistung_reduziert} W
    </Descriptions.Item>,
    <Descriptions.Item label='Lampe'>{leuchtTypItem?.lampe}</Descriptions.Item>,
    <Descriptions.Item label='Fabrikat'>{leuchtTypItem?.fabrikat}</Descriptions.Item>,
  ];

  subSections.push(
    <SecondaryInfoPanelSection
      key={"Leuchtentyp" + item.id}
      bsStyle='info'
      header={
        "Leuchtentyp (" + leuchtTypItem?.typenbezeichnung + ")" + ivAsterisk(item.fk_leuchttyp_iv)
      }
    >
      <Descriptions column={{ xs: 1, sm: 1, md: 3, lg: 3, xxl: 3 }} layout='horizontal' bordered>
        {clearOptionalDescriptionItems(leuchtTypItems)}
        {/* {leuchtTypItems} */}
      </Descriptions>
      {getSquaredThumbnails({ docs, type: "Leuchtentyp", jwt, setIndex, setVisible, openLightBox })}
    </SecondaryInfoPanelSection>
  );

  subSections.push(
    <SecondaryInfoPanelSection
      key={"mast" + item?.fk_standort?.id}
      bsStyle='warning'
      header='Mast'
      extra={showActions && getAddImageButton(dispatch, item?.fk_standort, "tdta_standort_mast")}
    >
      {getStandortDetails({ standortItem: item?.fk_standort, docs, jwt, setIndex, setVisible })}
    </SecondaryInfoPanelSection>
  );

  return { title, mainSection, subSections };
};

export default getLayout4Leuchte;

export const getRSDetailItems = (rsItem) => {
  if (rsItem) {
    const rsItems = [
      <Descriptions.Item label='Typ'>{rsItem?.rs_typ}</Descriptions.Item>,
      <Descriptions.Item label='Anschlusswert'>{rsItem?.anschlusswert}</Descriptions.Item>,
      <Descriptions.Item label='Hersteller'>{rsItem?.herrsteller_rs}</Descriptions.Item>,
      <Descriptions.Item label='RS Programm'>{rsItem?.programm}</Descriptions.Item>,
    ];
    return clearOptionalDescriptionItems(rsItems);
  } else {
    return [];
  }
};

export const getRSDetailsSection = (item) => {
  const rsItem = item?.rundsteuerempfaenger;
  if (rsItem) {
    return (
      <SecondaryInfoPanelSection
        key={"rs" + rsItem.id}
        bsStyle='warning'
        header={"Rundsteuerempfänger" + ivAsterisk(item.rundsteuerempfaenger_iv)}
      >
        <Descriptions column={{ xs: 1, sm: 1, md: 2, lg: 2, xxl: 3 }} layout='horizontal' bordered>
          {clearOptionalDescriptionItems(getRSDetailItems(rsItem))}
        </Descriptions>
      </SecondaryInfoPanelSection>
    );
  } else {
    return null;
  }
};
