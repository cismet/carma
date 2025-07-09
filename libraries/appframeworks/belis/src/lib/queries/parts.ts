export const abzweigdose_fields = `
    id
    is_deleted
    geom {
      geo_field
    }
    dokumenteArray(where: {}) {
      dms_url {
        description
        url {
          object_name
          url_base {
            path
            prot_prefix
            server
          }
        }
      }
    }
`;

export const leitung_fields = `
    geom {
      geo_field
    }
    fk_leitungstyp: leitungstyp {
      id
      bezeichnung
    }
    fk_material: material_leitung {
      id
      bezeichnung
    }
    fk_querschnitt: querschnitt {
      id
      groesse
    }
    id
    is_deleted
    dokumenteArray {
      dms_url {
        description
        url {
          object_name
          url_base {
            path
            prot_prefix
            server
          }
        }
      }
    }
  `;
export const mauerlasche_fields = `
  bemerkung
  dokumenteArray {
    dms_url {
      description
      url {
        object_name
        url_base {
          path
          prot_prefix
          server
        }
      }
    }
  }
  erstellungsjahr
  foto
  fk_strassenschluessel: tkey_strassenschluessel {
    id
    pk
    strasse
  }
  fk_material: material_mauerlasche {
    id
    bezeichnung
  }
  id
  is_deleted
  laufende_nummer
  monteur
  pruefdatum
  geom {
    geo_field
  }
`;

export const schaltstelle_fields = `
bemerkung
dokumenteArray {
  dms_url {
    description
    url {
      object_name
      url_base {
        path
        prot_prefix
        server
      }
    }
  }
  id
}
foto: dms_url {
  description
  url {
    object_name
    url_base {
      path
      prot_prefix
      server
    }
  }
}
einbaudatum_rs
erstellungsjahr
fk_bauart: bauart {
  id
  bezeichnung
}

fk_strassenschluessel: tkey_strassenschluessel {
  id
  pk
  strasse
}
haus_nummer
id
is_deleted
laufende_nummer
monteur
pruefdatum
rundsteuerempfaenger: rundsteuerempfaengerObject {
  id
  anschlusswert
  dms_url {
    description
    url {
      object_name
      url_base {
        path
        prot_prefix
        server
      }
    }
  }
  foto
  herrsteller_rs
  programm
  rs_typ
}
schaltstellen_nummer
zusaetzliche_standortbezeichnung
geom {
  geo_field
}
`;

export const mast_fields = `
inbetriebnahme_mast
letzte_aenderung
id
verrechnungseinheit
standortangabe
plz
anbauten
elek_pruefung
revision
standsicherheitspruefung
lfd_nummer
montagefirma
is_deleted
anstrichfarbe
monteur
bemerkungen
gruendung
verfahren
erdung
haus_nr
naechstes_pruefdatum
mastanstrich
mastschutz
ist_virtueller_standort
geom {
  geo_field
}
fk_kennziffer: tkey_kennziffer {
  id
  beschreibung
  kennziffer
}
anlagengruppe: anlagengruppeObject {
  nummer
  bezeichnung
}
fk_stadtbezirk: tkey_bezirk {
  id
  bezirk
  pk
}
fk_klassifizierung: tkey_klassifizierung {
  id
  klassifizierung
  pk
}
dokumenteArray {
  dms_url {
    description
    url {
      object_name
      url_base {
        path
        prot_prefix
        server
      }
    }
  }
}
fk_masttyp: tkey_masttyp {
  bezeichnung
  dms_url {
    description
    url {
      object_name
      url_base {
        path
        prot_prefix
        server
      }
    }
  }
  dokumenteArray {
    dms_url {
      description
      url {
        object_name
        url_base {
          path
          prot_prefix
          server
        }
      }
    }
    id
    tkey_masttyp
  }
  foto
  hersteller
  id
  lph
  masttyp
  wandstaerke
}
fk_mastart: tkey_mastart {
  id
  pk
  mastart
}
fk_unterhaltspflicht_mast: tkey_unterh_mast {
  id
  pk
  unterhalt_mast
}
fk_strassenschluessel: tkey_strassenschluessel {
  id
  pk
  strasse
}
`;

export const rundsteuerempfaenger_fields = `
  id
  anschlusswert
  dms_url {
    description
    url {
      object_name
      url_base {
        path
        prot_prefix
        server
      }
    }
  }
  foto
  herrsteller_rs
  programm
  rs_typ`;
export const leuchtentyp_fields = `
  bestueckung
    dokumenteArray {
      dms_url {
        description
        url {
          object_name
          url_base {
            path
            prot_prefix
            server
          }
        }
      }
      tkey_leuchtentyp_reference
      id
    }
    dms_url {
      description
      url {
        object_name
        url_base {
          path
          prot_prefix
          server
        }
      }
    }
    vorschaltgeraet
    typenbezeichnung
    leuchtentyp
    leistung_reduziert
    leistung_brutto_reduziert
    leistung_brutto
    leistung2stufe
    leistung
    lampe
    id
    foto
    fabrikat
    einbau_vorschaltgeraet`;

export const leuchte_fields = `
id
leuchtennummer
plz
einbaudatum
anschlussleistung_1dk
vorschaltgeraet
anschlussleistung_2dk
schaltstelle
anzahl_1dk
anzahl_2dk
lfd_nummer
is_deleted
wartungszyklus
lebensdauer
monteur
naechster_wechsel
wechselvorschaltgeraet
wechseldatum
zaehler
montagefirma_leuchte
inbetriebnahme_leuchte
bemerkungen
dokumenteArray {
  dms_url {
    description
    url {
      object_name
      url_base {
        path
        prot_prefix
        server
      }
    }
  }
}
fk_dk1: fk_dk1_tkey_doppelkommando {
  id
  pk
  beschreibung
}
fk_dk2: fk_dk2_tkey_doppelkommando {
  id
  pk
  beschreibung
}

rundsteuerempfaenger: rundsteuerempfaengerObject {
  ${rundsteuerempfaenger_fields}
}
fk_strassenschluessel: tkey_strassenschluessel {
  id
  pk
  strasse
}
fk_kennziffer: tkey_kennziffer {
  id
  beschreibung
  kennziffer
}
fk_leuchttyp: tkey_leuchtentyp {
  ${leuchtentyp_fields}
}
fk_unterhaltspflicht_leuchte: tkey_unterh_leuchte {
  id
  pk
  unterhaltspflichtiger_leuchte
}
fk_energielieferant: tkey_energielieferant {
  id
  pk
  energielieferant
}
leuchtmittel: leuchtmittelObject {
  id
  hersteller
  lichtfarbe
}
fk_standort: tdta_standort_mast {
  ${mast_fields}
}
`;

export const veranlassung_fields = `
        id
        nummer
        bezeichnung
        veranlassungsart {
          bezeichnung
          schluessel
        }
        beschreibung
        username
        datum
        bemerkungen
        ar_dokumenteArray {
          dms_url {
            description
            id
            name
            url {
              id
              object_name
              url_base {
                prot_prefix
                server
                path
              }
            }
          }
        }
        
`;
