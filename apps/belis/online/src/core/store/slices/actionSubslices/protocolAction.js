import { v4 as uuidv4 } from 'uuid';
import { getDate } from '../../../../components/commons/secondaryinfo/components/helper';

import { getJWT, getLoginFromJWT } from '../auth';
import {
  getLeuchtentypenKT,
  getLeuchtmittelKT,
  getRundsteuerempfaengerKT,
} from '../keytables';
import { addIntermediateResult, getDB } from '../offlineActionDb';

const protocolAction = (params, item) => {
  return async (dispatch, getState) => {
    const state = getState();
    const offlineActionDb = getDB(state);
    const jwt = getJWT(state);
    const login = getLoginFromJWT(jwt);
    const ccnonce = Math.floor(Math.random() * 10000000000);
    const paramsWithCCNonce = { ...params, ccnonce };
    const leuchtmittelKT = getLeuchtmittelKT(state);
    const leuchtenTypKT = getLeuchtentypenKT(state);
    const rundsteuerempfaengerKT = getRundsteuerempfaengerKT(state);
    const getLeuchtmittel = (id) => {
      return leuchtmittelKT.find((item) => item.id === id);
    };
    const getLeuchtenTyp = (id) => {
      return leuchtenTypKT.find((item) => item.id === id);
    };
    const getRundsteuerempfaenger = (id) => {
      return rundsteuerempfaengerKT.find((item) => item.id === id);
    };

    const offlineAction = {
      id: uuidv4(),
      action: paramsWithCCNonce.actionname,
      jwt: jwt,
      parameter: JSON.stringify(paramsWithCCNonce),
      isCompleted: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      applicationId: login + '@belis',
    };

    offlineActionDb.actions.insert(offlineAction);

    //since bemerkung is used twice in the params object we nee to rename it if it comes from protokollFortfuehrungsantrag

    if (paramsWithCCNonce.actionname === 'protokollFortfuehrungsantrag') {
      paramsWithCCNonce.fortfuehrungsinfo = paramsWithCCNonce.bemerkung;
      delete paramsWithCCNonce.bemerkung;
    }

    console.log(
      'added object to offline db to addIncident',
      paramsWithCCNonce,
      offlineAction
    );
    let intermediateResult4Prot = {
      object_type: 'arbeitsprotokoll',
      object_id: paramsWithCCNonce.protokoll_id,
      data: {
        ...paramsWithCCNonce,
        protokollAktionArray: [],
      },
      ts: paramsWithCCNonce.ts,
      action: paramsWithCCNonce.actionname,
      resultType: 'object',
    };

    switch (paramsWithCCNonce.actionname) {
      case 'protokollStatusAenderung':
        //nothing else to do
        break;
      case 'protokollLeuchteLeuchtenerneuerung':
        const leuchtenTyp = getLeuchtenTyp(paramsWithCCNonce.leuchtentyp);
        const leuchtenTypAlt = getLeuchtenTyp(
          item.tdta_leuchten.fk_leuchttyp.id
        );
        const leuchtenTypBezeichnung =
          leuchtenTyp.leuchtentyp + ' - ' + leuchtenTyp.fabrikat;
        const leuchtenTypBezeichnungAlt =
          leuchtenTypAlt.leuchtentyp + ' - ' + leuchtenTypAlt.fabrikat;

        intermediateResult4Prot.data.protokollAktionArray.push({
          aenderung: 'Inbetriebnahme',
          alt: item.tdta_leuchten.inbetriebnahme_leuchte,
          neu: getDate(paramsWithCCNonce.inbetriebnahmedatum),
          ccnonce,
          ir: true,
        });
        intermediateResult4Prot.data.protokollAktionArray.push({
          aenderung: 'Leuchtentyp',
          alt: leuchtenTypBezeichnungAlt,
          neu: leuchtenTypBezeichnung,
          ccnonce,
          ir: true,
        });

        dispatch(
          addMoreIntermediateResults(
            'tdta_leuchten',
            item.tdta_leuchten.id,
            {
              inbetriebnahme_leuchte: paramsWithCCNonce.inbetriebnahmedatum
                ? new Date(paramsWithCCNonce.inbetriebnahmedatum).toISOString()
                : undefined,
              fk_leuchttyp: getLeuchtenTyp(paramsWithCCNonce.leuchtentyp),
            },
            paramsWithCCNonce
          )
        );

        break;
      case 'protokollLeuchteLeuchtmittelwechselElekpruefung':
        const leuchtmittel = getLeuchtmittel(paramsWithCCNonce.leuchtmittel);
        const leuchtmittelBezeichung =
          leuchtmittel?.hersteller + ' ' + leuchtmittel?.lichtfarbe;
        const leuchtmittelAlt = item.tdta_leuchten?.leuchtmittel;
        const leuchtmittelBezeichungAlt =
          leuchtmittelAlt?.hersteller + ' ' + leuchtmittelAlt?.lichtfarbe;

        intermediateResult4Prot.data.protokollAktionArray.push({
          aenderung: 'Wechseldatum',
          alt: item.tdta_leuchten.wechseldatum,
          neu: getDate(paramsWithCCNonce.wechseldatum),
          ccnonce,
          ir: true,
        });
        intermediateResult4Prot.data.protokollAktionArray.push({
          aenderung: 'Lebensdauer',
          alt: item.tdta_leuchten.lebensdauer,
          neu: paramsWithCCNonce.lebensdauer,
          ccnonce,
          ir: true,
        });
        intermediateResult4Prot.data.protokollAktionArray.push({
          aenderung: 'Leuchtmittel',
          alt: item.tdta_leuchten?.leuchtmittel
            ? leuchtmittelBezeichungAlt
            : undefined,
          neu: leuchtmittelBezeichung,
          ccnonce,
          ir: true,
        });

        intermediateResult4Prot.data.protokollAktionArray.push({
          aenderung: 'Elektrische Prüfung',
          alt: item.tdta_leuchten?.fk_standort?.elek_pruefung,
          neu: getDate(paramsWithCCNonce.pruefdatum),
          ccnonce,
          ir: true,
        });
        intermediateResult4Prot.data.protokollAktionArray.push({
          aenderung: 'Erdung in Ordnung',
          alt: item.tdta_leuchten?.fk_standort?.erdung,
          neu: paramsWithCCNonce.erdung_in_ordnung,
          ccnonce,
          ir: true,
        });

        dispatch(
          addMoreIntermediateResults(
            'tdta_leuchten',
            item.tdta_leuchten.id,
            {
              leuchtmittel: getLeuchtmittel(paramsWithCCNonce.leuchtmittel),
              wechseldatum: paramsWithCCNonce.wechseldatum
                ? new Date(paramsWithCCNonce.wechseldatum).toISOString()
                : undefined,
              lebensdauer: paramsWithCCNonce.lebensdauer,
            },
            paramsWithCCNonce
          )
        );

        if (item.tdta_leuchten?.fk_standort) {
          dispatch(
            addMoreIntermediateResults(
              'tdta_standort_mast',
              item.tdta_leuchten?.fk_standort.id,
              {
                elek_pruefung: paramsWithCCNonce.pruefdatum
                  ? new Date(paramsWithCCNonce.pruefdatum).toISOString()
                  : undefined,
                erdung: paramsWithCCNonce.erdung,
              },
              paramsWithCCNonce
            )
          );
        }
        break;
      case 'protokollLeuchteLeuchtmittelwechsel':
        const leuchtmittel2 = getLeuchtmittel(paramsWithCCNonce.leuchtmittel);
        const leuchtmittelBezeichung2 =
          leuchtmittel2?.hersteller + ' ' + leuchtmittel2?.lichtfarbe;
        const leuchtmittelAlt2 = item.tdta_leuchten.leuchtmittel;
        const leuchtmittelBezeichungAlt2 =
          leuchtmittelAlt2?.hersteller + ' ' + leuchtmittelAlt2?.lichtfarbe;

        intermediateResult4Prot.data.protokollAktionArray.push({
          aenderung: 'Wechseldatum',
          alt: item.tdta_leuchten.wechseldatum,
          neu: getDate(paramsWithCCNonce.wechseldatum),
          ccnonce,
          ir: true,
        });
        intermediateResult4Prot.data.protokollAktionArray.push({
          aenderung: 'Lebensdauer',
          alt: item.tdta_leuchten.lebensdauer,
          neu: paramsWithCCNonce.lebensdauer,
          ccnonce,
          ir: true,
        });
        intermediateResult4Prot.data.protokollAktionArray.push({
          aenderung: 'Leuchtmittel',
          alt: item.tdta_leuchten.leuchtmittel
            ? leuchtmittelBezeichungAlt2
            : undefined,
          neu: leuchtmittelBezeichung2,
          ccnonce,
          ir: true,
        });

        dispatch(
          addMoreIntermediateResults(
            'tdta_leuchten',
            item.tdta_leuchten.id,

            {
              leuchtmittel: getLeuchtmittel(paramsWithCCNonce.leuchtmittel),
              wechseldatum: paramsWithCCNonce.wechseldatum
                ? new Date(paramsWithCCNonce.wechseldatum).toISOString()
                : undefined,
              lebensdauer: paramsWithCCNonce.lebensdauer,
            },
            paramsWithCCNonce
          )
        );
        break;
      case 'protokollLeuchteRundsteuerempfaengerwechsel':
        const rs = getRundsteuerempfaenger(
          paramsWithCCNonce.rundsteuerempfaenger
        );
        const rundsteuerempfaengerBezeichungAlt =
          (item.tdta_leuchten.rundsteuerempfaenger?.herrsteller_rs ||
            'ohne Hersteller') +
          ' - ' +
          item.tdta_leuchten.rundsteuerempfaenger?.rs_typ;
        const rundsteuerempfaengerBezeichung =
          (rs.herrsteller_rs || 'ohne Hersteller') + ' - ' + rs.rs_typ;
        intermediateResult4Prot.data.protokollAktionArray.push({
          aenderung: 'Einbaudatum',
          alt: item.tdta_leuchten.einbaudatum,
          neu: getDate(paramsWithCCNonce.einbaudatum),
          ccnonce,
          ir: true,
        });
        intermediateResult4Prot.data.protokollAktionArray.push({
          aenderung: 'Rundsteuerempfänger',
          alt: item.tdta_leuchten.rundsteuerempfaenger
            ? rundsteuerempfaengerBezeichungAlt
            : undefined,
          neu: rundsteuerempfaengerBezeichung,
          ccnonce,
          ir: true,
        });
        //params.einbaudatum
        //params.rundsteuerempfaenger
        dispatch(
          addMoreIntermediateResults(
            'tdta_leuchten',
            item.tdta_leuchten.id,
            {
              einbaudatum: paramsWithCCNonce.einbaudatum
                ? new Date(paramsWithCCNonce.einbaudatum).toISOString()
                : undefined,
              rundsteuerempfaenger: rs,
            },
            paramsWithCCNonce
          )
        );
        break;
      case 'protokollLeuchteSonderturnus':
        intermediateResult4Prot.data.protokollAktionArray.push({
          aenderung: 'Sonderturnus',
          alt: item.tdta_leuchten.wartungszyklus,
          neu: getDate(paramsWithCCNonce.sonderturnusdatum),
          ccnonce,
          ir: true,
        });

        //params.sonderturnusdatum
        dispatch(
          addMoreIntermediateResults(
            'tdta_leuchten',
            item.tdta_leuchten.id,
            {
              wartungszyklus: paramsWithCCNonce.sonderturnusdatum
                ? new Date(paramsWithCCNonce.sonderturnusdatum).toISOString()
                : undefined,
            },
            paramsWithCCNonce
          )
        );
        break;
      case 'protokollLeuchteVorschaltgeraetwechsel':
        intermediateResult4Prot.data.protokollAktionArray.push({
          aenderung: 'Erneuerung Vorschaltgerät',
          alt: item.tdta_leuchten.wechselvorschaltgeraet,
          neu: getDate(paramsWithCCNonce.wechseldatum),
          ccnonce,
          ir: true,
        });

        intermediateResult4Prot.data.protokollAktionArray.push({
          aenderung: 'Vorschaltgerät',
          alt: item.tdta_leuchten.vorschaltgeraet,
          neu: paramsWithCCNonce.vorschaltgeraet,
          ccnonce,
          ir: true,
        });

        dispatch(
          addMoreIntermediateResults(
            'tdta_leuchten',
            item.tdta_leuchten.id,
            {
              wechselvorschaltgeraet: paramsWithCCNonce.wechseldatum
                ? new Date(paramsWithCCNonce.wechseldatum).toISOString()
                : undefined,
              vorschaltgeraet: paramsWithCCNonce.vorschaltgeraet,
            },
            paramsWithCCNonce
          )
        );
        break;
      case 'protokollStandortAnstricharbeiten':
        intermediateResult4Prot.data.protokollAktionArray.push({
          aenderung: 'Mastanstrich',
          alt:
            item.tdta_standort_mast?.mastanstrich ||
            item.tdta_leuchten?.fk_standort?.mastanstrich,
          neu: getDate(paramsWithCCNonce.anstrichdatum),
          ccnonce,
          ir: true,
        });

        intermediateResult4Prot.data.protokollAktionArray.push({
          aenderung: 'Anstrichfarbe',
          alt:
            item.tdta_standort_mast?.anstrichfarbe ||
            item.tdta_leuchten?.fk_standort?.anstrichfarbe,
          neu: paramsWithCCNonce.anstrichfarbe,
          ccnonce,
          ir: true,
        });

        dispatch(
          addMoreIntermediateResults(
            'tdta_standort_mast',
            item.tdta_leuchten?.fk_standort?.id || item.tdta_standort_mast?.id,
            {
              mastanstrich: paramsWithCCNonce.anstrichdatum
                ? new Date(paramsWithCCNonce.anstrichdatum).toISOString()
                : undefined,
              anstrichfarbe: paramsWithCCNonce.anstrichfarbe,
            },
            paramsWithCCNonce
          )
        );
        break;
      case 'protokollStandortElektrischePruefung':
        intermediateResult4Prot.data.protokollAktionArray.push({
          aenderung: 'Elektrische Prüfung',
          alt:
            item.tdta_standort_mast?.elek_pruefung ||
            item.tdta_leuchten?.fk_standort?.elek_pruefung,
          neu: getDate(paramsWithCCNonce.pruefdatum),
          ccnonce,
          ir: true,
        });

        intermediateResult4Prot.data.protokollAktionArray.push({
          aenderung: 'Erdung in Ordnung',
          alt:
            item.tdta_standort_mast?.erdung ||
            item.tdta_leuchten?.fk_standort?.erdung,
          neu: paramsWithCCNonce.erdung_in_ordnung,
          ccnonce,
          ir: true,
        });

        //params.pruefdatum
        //params.erdung_in_ordnung
        dispatch(
          addMoreIntermediateResults(
            'tdta_standort_mast',
            item.tdta_leuchten?.fk_standort?.id || item.tdta_standort_mast?.id,

            {
              elek_pruefung: paramsWithCCNonce.pruefdatum
                ? new Date(paramsWithCCNonce.pruefdatum).toISOString()
                : undefined,
              erdung: paramsWithCCNonce.erdung,
            },
            paramsWithCCNonce
          )
        );
        break;
      case 'protokollStandortMasterneuerung':
        intermediateResult4Prot.data.protokollAktionArray.push({
          aenderung: 'Inbetriebnahme',
          alt:
            item.tdta_standort_mast?.inbetriebnahme_mast ||
            item.tdta_leuchten?.fk_standort?.inbetriebnahme_mast,
          neu: getDate(paramsWithCCNonce.inbetriebnahmedatum),
          ccnonce,
          ir: true,
        });

        intermediateResult4Prot.data.protokollAktionArray.push({
          aenderung: 'Montagefirma',
          alt:
            item.tdta_standort_mast?.montagefirma ||
            item.tdta_leuchten?.fk_standort?.montagefirma,
          neu: paramsWithCCNonce.montagefirma,
          ccnonce,
          ir: true,
        });
        intermediateResult4Prot.data.protokollAktionArray.push({
          aenderung: 'Standsicherheitsprüfung',
          alt:
            item.tdta_standort_mast?.standsicherheitspruefung ||
            item.tdta_leuchten?.fk_standort?.standsicherheitspruefung,
          neu: null,
          ccnonce,
          ir: true,
        });

        intermediateResult4Prot.data.protokollAktionArray.push({
          aenderung: 'Verfahren',
          alt:
            item.tdta_standort_mast?.verfahren ||
            item.tdta_leuchten?.fk_standort?.verfahren,
          neu: null,
          ccnonce,
          ir: true,
        });
        intermediateResult4Prot.data.protokollAktionArray.push({
          aenderung: 'Nächstes Prüfdatum',
          alt:
            item.tdta_standort_mast?.naechstes_pruefdatum ||
            item.tdta_leuchten?.fk_standort?.naechstes_pruefdatum,
          neu: null,
          ccnonce,
          ir: true,
        });

        //params.inbetriebnahmedatum
        //params.montagefirma
        dispatch(
          addMoreIntermediateResults(
            'tdta_standort_mast',
            item.tdta_leuchten?.fk_standort?.id || item.tdta_standort_mast?.id,
            {
              inbetriebnahme_mast: paramsWithCCNonce.inbetriebnahmedatum
                ? new Date(paramsWithCCNonce.inbetriebnahmedatum).toISOString()
                : undefined,
              montagefirma: paramsWithCCNonce.montagefirma,
              standsicherheitspruefung: null,
              verfahren: null,
              naechstes_pruefdatum: null,
            },
            paramsWithCCNonce
          )
        );
        break;
      case 'protokollStandortRevision':
        intermediateResult4Prot.data.protokollAktionArray.push({
          aenderung: 'Revision',
          alt:
            item.tdta_standort_mast?.revision ||
            item.tdta_leuchten?.fk_standort?.revision,
          neu: getDate(paramsWithCCNonce.revisionsdatum),
          ccnonce,
          ir: true,
        });

        dispatch(
          addMoreIntermediateResults(
            'tdta_standort_mast',
            item.tdta_leuchten?.fk_standort?.id || item.tdta_standort_mast?.id,

            {
              revision: paramsWithCCNonce.revisionsdatum
                ? new Date(paramsWithCCNonce.revisionsdatum).toISOString()
                : undefined,
            },
            paramsWithCCNonce
          )
        );
        break;
      case 'protokollStandortStandsicherheitspruefung':
        intermediateResult4Prot.data.protokollAktionArray.push({
          aenderung: 'Standsicherheitsprüfung',
          alt:
            item.tdta_standort_mast?.standsicherheitspruefung ||
            item.tdta_leuchten?.fk_standort?.standsicherheitspruefung,
          neu: getDate(paramsWithCCNonce.pruefdatum),
          ccnonce,
          ir: true,
        });
        intermediateResult4Prot.data.protokollAktionArray.push({
          aenderung: 'Verfahren',
          alt:
            item.tdta_standort_mast?.verfahren ||
            item.tdta_leuchten?.fk_standort?.verfahren,
          neu: paramsWithCCNonce.verfahren,
          ccnonce,
          ir: true,
        });
        intermediateResult4Prot.data.protokollAktionArray.push({
          aenderung: 'Nächstes Prüfdatum',
          alt:
            item.tdta_standort_mast?.naechstes_pruefdatum ||
            item.tdta_leuchten?.fk_standort?.naechstes_pruefdatum,
          neu: getDate(paramsWithCCNonce.naechstes_pruefdatum),
          ccnonce,
          ir: true,
        });

        dispatch(
          addMoreIntermediateResults(
            'tdta_standort_mast',
            item.tdta_leuchten?.fk_standort?.id || item.tdta_standort_mast?.id,

            {
              standsicherheitspruefung: paramsWithCCNonce.pruefdatum
                ? new Date(paramsWithCCNonce.pruefdatum).toISOString()
                : undefined,
              verfahren: paramsWithCCNonce.verfahren,
              naechstes_pruefdatum: paramsWithCCNonce.naechstes_pruefdatum
                ? new Date(paramsWithCCNonce.naechstes_pruefdatum).toISOString()
                : undefined,
            },
            paramsWithCCNonce
          )
        );
        break;
      case 'protokollMauerlaschePruefung':
        intermediateResult4Prot.data.protokollAktionArray.push({
          aenderung: 'Prüfdatum',
          alt: item.mauerlasche.pruefdatum,
          neu: getDate(paramsWithCCNonce.pruefdatum),
          ccnonce,
          ir: true,
        });

        //params.pruefdatum
        dispatch(
          addMoreIntermediateResults(
            'mauerlasche',
            item.mauerlasche.id,
            {
              pruefdatum: paramsWithCCNonce.pruefdatum
                ? new Date(paramsWithCCNonce.pruefdatum).toISOString()
                : undefined,
            },
            paramsWithCCNonce
          )
        );
        break;
      case 'protokollSchaltstelleRevision':
        intermediateResult4Prot.data.protokollAktionArray.push({
          aenderung: 'Prüfdatum',
          alt: item.schaltstelle.pruefdatum,
          neu: getDate(paramsWithCCNonce.pruefdatum),
          ccnonce,
          ir: true,
        });

        //params.pruefdatum
        dispatch(
          addMoreIntermediateResults(
            'schaltstelle',
            item.schaltstelle.id,
            {
              pruefdatum: paramsWithCCNonce.pruefdatum
                ? new Date(paramsWithCCNonce.pruefdatum).toISOString()
                : undefined,
            },
            paramsWithCCNonce
          )
        );
        break;
      case 'protokollFortfuehrungsantrag':
        intermediateResult4Prot.data.protokollAktionArray.push({
          aenderung: 'Sonstiges',
          alt: null,
          neu: paramsWithCCNonce.fortfuehrungsinfo,
          ccnonce,
          ir: true,
        });

        //no further intermediate results
        break;

      default:
    }

    dispatch(addIntermediateResult(intermediateResult4Prot));
  };
};

const addMoreIntermediateResults = (type, id, data, params) => {
  return async (dispatch, getState) => {
    const intermediateResults = {
      object_type: type,
      object_id: id,
      data,
      ts: params.ts,
      action: params.actionname,
      resultType: 'object',
    };
    dispatch(addIntermediateResult(intermediateResults));
  };
};

export default protocolAction;
