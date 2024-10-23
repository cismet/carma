import React, { useState, useRef, useEffect } from "react";
import { storiesCategory } from "./StoriesConf";
import GenericSecondaryInfo from "react-cismap/topicmaps/SecondaryInfo";
import GenericSecondaryInfoPanelSection from "react-cismap/topicmaps/SecondaryInfoPanelSection";
import Button from "react-bootstrap/Button";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import { InfoPanelComponent } from "../components/commons/secondaryinfo/SecondaryInfo";
import { data } from "./data";
export default {
  title: storiesCategory + "SecondaryInfoContent",
};

const leuchteMitAllenAttributen = {
  featuretype: "tdta_leuchten",
  properties: {
    docs: [
      {
        caption: "Standort ",
        doc: "DOC-1474274732136-1702915229.jpg",
        description: "Schalter DK 12_24 Bodenstrahler",
      },
      {
        caption: "Standort ",
        doc: "DOC-1474274741480-629789389.jpg",
        description: "22.03.2016",
      },
      {
        caption: "Standort ",
        doc: "DOC-1474274752572-1706511915.jpg",
        description: "25.04.2016",
      },
    ],
    plz: 42103,
    leuchtennummer: 3,
    id: 33540,
    einbaudatum: "1969-09-17T00:00:00",
    anschlussleistung_1dk: 8,
    vorschaltgeraet: "PLC 26W",
    anschlussleistung_2dk: 8,
    schaltstelle: "L11",
    anzahl_1dk: 1,
    anzahl_2dk: 1,
    is_deleted: null,
    wartungszyklus: "2019-09-26T11:34:38.447",
    lebensdauer: 2,
    monteur: "Hell",
    naechster_wechsel: "2022-09-26T11:34:38.447",
    wechselvorschaltgeraet: "2022-09-26T11:34:38.447",
    wechseldatum: "2018-01-11T11:11:03.902",
    zaehler: false,
    montagefirma_leuchte: "SAG",
    inbetriebnahme_leuchte: "1969-09-17T00:00:00",
    bemerkungen: "neues Glas mit Folie von Philips eingebaut August 2015",
    dokumenteArray: [
      {
        dms_url: {
          description: "test",
          url: {
            object_name: "upload.from.ios.for.tdta_leuchten.33539-1613466436887.jpg",
            url_base: {
              path: "/belis/",
              prot_prefix: "http://",
              server: "board.cismet.de",
            },
          },
        },
      },
    ],
    rundsteuerempfaenger: {
      id: 14,
      rs_typ: "K - Kabel",
    },
    fk_strassenschluessel: {
      id: 2031,
      pk: "03635",
      strasse: "WERTH",
    },
    fk_kennziffer: {
      id: 1,
      beschreibung: "Leuchte mit oder ohne Mast",
      kennziffer: 0,
    },
    fk_leuchttyp: {
      bestueckung: 10,
      typenbezeichnung: "LED",
      leuchtentyp: "L 608",
      leistung_brutto: 8,
      leistung: 8,
      lampe: "LED-Retrofit E27",
      id: 189,
      fabrikat: "Schmuckkandelaber",
    },
    fk_unterhaltspflicht_leuchte: {
      id: 1,
      pk: 0,
      unterhaltspflichtiger_leuchte: "Öffentl. Beleuchtung",
    },
    fk_energielieferant: {
      id: 1,
      pk: 0,
      energielieferant: "WSW",
    },
    fk_standort: {
      id: 33655,
      bemerkungen: "25.04.2016 Schalter DK 12/24 für Bodenstrahler montiert",
      anstrichfarbe: "Schwarz seidenmatt",
      dokumenteArray: [
        {
          dms_url: {
            description: "Schalter DK 12_24 Bodenstrahler",
            url: {
              object_name: "DOC-1474274732136-1702915229.jpg",
              url_base: {
                path: "/belis/",
                prot_prefix: "http://",
                server: "board.cismet.de",
              },
            },
          },
        },
        {
          dms_url: {
            description: "22.03.2016",
            url: {
              object_name: "DOC-1474274741480-629789389.jpg",
              url_base: {
                path: "/belis/",
                prot_prefix: "http://",
                server: "board.cismet.de",
              },
            },
          },
        },
        {
          dms_url: {
            description: "25.04.2016",
            url: {
              object_name: "DOC-1474274752572-1706511915.jpg",
              url_base: {
                path: "/belis/",
                prot_prefix: "http://",
                server: "board.cismet.de",
              },
            },
          },
        },
      ],
      elek_pruefung: "2020-10-19 14:21:07.660",
      erdung: true,
      fk_kennziffer: 1,
      fk_klassifizierung: 2,
      fk_mastart: 8,
      fk_masttyp: 14,
      fk_stadtbezirk: 6,
      fk_strassenschluessel: 2031,
      fk_unterhaltspflicht_mast: 1,
      gruendung: "Ankerkorb in Beton",
      haus_nr: "73c",
      inbetriebnahme_mast: "1991-08-30T00:00:00",
      ist_virtueller_standort: null,
      letzte_aenderung: "2021-09-24T07:43:07.059",
      lfd_nummer: 11,
      mastanstrich: "1991-08-30T00:00:00",
      mastschutz: "2007-12-17 00:00:00.000",
      montagefirma: "SAG",
      monteur: "SAG",
      naechstes_pruefdatum: "2022-12-17 00:00:00.000",
      revision: "2020-11-12 09:53:16.869",
      standortangabe: "Rathhausvorplatz West",
      standsicherheitspruefung: "2016-11-12 18:00:31.968",
      verfahren: "Reilux",
      verrechnungseinheit: true,
      anbauten: "Stroer",
      anlagengruppeObject: {
        nummer: 16,
        bezeichnung: "Sonderleuchten (z.B. G-S-Platz, Kerstenplatz, Herzogstr)",
      },
      geom: {
        geo_field: {
          type: "Point",
          crs: {
            type: "name",
            properties: {
              name: "urn:ogc:def:crs:EPSG::25832",
            },
          },
          coordinates: [374457.15416320803, 5681556.95977417],
        },
      },
      mastart: {
        id: 8,
        pk: "S",
        mastart: "Stahlmast",
      },
      unterhaltspflicht_mast: {
        id: 1,
        pk: 0,
        unterhalt_mast: "öffentl. Beleuchtung",
      },
      masttyp: {
        bezeichnung: "Schmuckkandelaber",
        id: 14,
        masttyp: "214",
      },
      kennziffer: {
        id: 1,
        beschreibung: "Leuchte mit oder ohne Mast",
        kennziffer: 0,
      },
      stadtbezirk: {
        id: 6,
        bezirk: "BARMEN",
        pk: 5,
      },
      klassifizierung: {
        id: 2,
        klassifizierung: "verzinkt (Stahlmast)",
        pk: 1,
      },
    },
    fk_dk1: {
      id: 2,
      beschreibung: "Ganznachtbetrieb ",
      pk: "12",
    },
  },
};

export const LeuchtenInfoBreitGross = () => {
  return (
    <div style={{ margin: 50, backgroundColor: "#aaaaaa", width: "1112px", height: "834px" }}>
      <InfoPanelComponent selectedFeature={leuchteMitAllenAttributen} dispatch={() => {}} />
      sss
    </div>
  );
};
// export const LeuchtenInfoSchmalGroß = () => {
//   return <div style={{ backgroundColor: "#aaaaaa", width: "834px", height: "1112px" }}>sdfsdf</div>;
// };
// export const LeuchtenInfoBreitKlein = () => {
//   return <div style={{ backgroundColor: "#aaaaaa", width: "1024px", height: "768px" }}>sdfsdf</div>;
// };
// export const LeuchtenInfoSchmalKlein = () => {
//   return <div style={{ backgroundColor: "#aaaaaa", width: "768px", height: "1024px" }}>sdfsdf</div>;
// };
