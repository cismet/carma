import dayjs from 'dayjs';
import {
  createStyler,
  getMarkerStyleFromFeatureConsideringSelection,
} from './mappingTools';

export const generalExtractor = (kassenzeichen, aenderungsAnfrage) => {
  const dateFormat = 'DD.MM.YYYY';
  const bemerkungsObject = kassenzeichen?.bemerkung;
  let formattedBemerkungen;
  if (bemerkungsObject) {
    try {
      const bemerkungen = JSON.parse(bemerkungsObject).bemerkungen.map(
        (bemerkung) => bemerkung.bemerkung
      );
      formattedBemerkungen = bemerkungen.join('\n');
    } catch (error) {
      console.log('error', error);

      formattedBemerkungen = bemerkungsObject;
    }
  }
  return {
    date: kassenzeichen?.datum_erfassung
      ? dayjs(
          dayjs(kassenzeichen?.datum_erfassung).format(dateFormat),
          dateFormat
        )
      : null,
    bemerkung: formattedBemerkungen,
    sperre: kassenzeichen?.sperre,
    aenderungsAnfrage:
      aenderungsAnfrage && aenderungsAnfrage[0]?.aenderungsanfrage_status?.name,
    kassenzeichenNummer: kassenzeichen?.kassenzeichennummer8,
  };
};

export const statisticsExtractor = (kassenzeichen, aenderungsAnfrage) => {
  return [
    {
      value: kassenzeichen?.flaechenArray?.length,
      title: 'Flächen',
    },
    {
      value: kassenzeichen?.frontenArray?.length,
      title: 'Fronten',
    },
    {
      value:
        kassenzeichen?.kanalanschlussObject?.befreiungenunderlaubnisseArray
          ?.length,
      title: 'Versickerungsgenehmigungen',
    },
    {
      value: kassenzeichen?.kassenzeichen_geometrienArray?.length,
      title: 'Geometrien',
    },
    {
      value: aenderungsAnfrage?.length,
      title: 'Änderungsanfragen',
    },
  ];
};

const extractNumber = (typeKey) => {
  return parseInt(typeKey.split('-')[0]);
};

export const sumsExtractor = (kassenzeichen) => {
  const data = kassenzeichen?.flaechenArray?.map((flaeche) => ({
    size:
      flaeche?.flaecheObject?.anteil ||
      flaeche?.flaecheObject?.flaecheninfoObject?.groesse_korrektur,
    type: flaeche?.flaecheObject?.flaecheninfoObject?.flaechenartObject
      ?.art_abkuerzung,
    connection:
      flaeche?.flaecheObject?.flaecheninfoObject?.anschlussgradObject
        ?.grad_abkuerzung,
  }));

  const typeSizeMap = new Map();
  const connectionSizeMap = new Map();

  data?.forEach((obj) => {
    const { type, connection, size } = obj;
    let typeKey = '';

    if (type === 'VF') {
      if (connection === 'vers.') {
        typeKey = '999-Rest';
      } else {
        typeKey = '720-VF';
      }
    }

    if (type === 'DF') {
      typeKey = '710-DF';
    }

    if (!typeKey) {
      typeKey = '999-Rest';
    }

    if (!typeSizeMap.has(typeKey)) {
      typeSizeMap.set(typeKey, 0);
    }
    typeSizeMap.set(typeKey, typeSizeMap.get(typeKey) + size);

    if (!connectionSizeMap.has(connection)) {
      connectionSizeMap.set(connection, 0);
    }
    connectionSizeMap.set(connection, connectionSizeMap.get(connection) + size);
  });

  const types = Array.from(typeSizeMap, ([type, size]) => ({
    type,
    size,
  })).sort((a, b) => extractNumber(a.type) - extractNumber(b.type));

  const connections = Array.from(connectionSizeMap, ([type, size]) => ({
    type,
    size,
  }));

  return [
    {
      title: 'Veranlagung',
      items: types,
    },
    {
      title: 'Anschlussgrad',
      items: connections,
    },
  ];
};

export const summaryExtractor = (kassenzeichen) => {
  const data = kassenzeichen?.frontenArray?.map((front) => ({
    key:
      front?.frontObject?.frontinfoObject?.lage_sr_satzung?.strassenreinigung
        ?.key +
      '-' +
      front?.frontObject?.frontinfoObject?.lage_sr_satzung?.strassenreinigung
        ?.schluessel,
    streetNumber:
      front?.frontObject?.frontinfoObject?.strasseObject?.schluessel,
    streetName: front?.frontObject?.frontinfoObject?.strasseObject?.name,
    length: front?.frontObject?.frontinfoObject?.laenge_grafik,
  }));

  const streetMap = data?.reduce((map, obj) => {
    const { key, streetNumber, streetName, length } = obj;
    const uniqueKey = `${key}-${streetNumber}-${streetName}`;

    if (!map[uniqueKey]) {
      map[uniqueKey] = { ...obj };
    } else {
      map[uniqueKey].length = (
        Number(map[uniqueKey].length) + Number(length)
      ).toString();
    }

    return map;
  }, {});

  const resultArray = Object.values(streetMap || []);

  return resultArray;
};

export const areasDetailsExtractor = (
  kassenzeichen,
  crossReferencesPerArea
) => {
  const data = kassenzeichen?.flaechenArray?.map((row) => {
    const flaeche = row?.flaecheObject;
    const flaecheInfo = flaeche?.flaecheninfoObject;
    let crossReferences = [];

    if (crossReferencesPerArea) {
      crossReferences = crossReferencesPerArea[flaecheInfo?.id];
    }
    return {
      name: flaeche?.flaechenbezeichnung,
      groesseGrafik: flaecheInfo?.groesse_aus_grafik,
      groesseKorrektor: flaecheInfo?.groesse_korrektur,
      flaechenArt: flaecheInfo?.flaechenartObject?.art,
      anschlussgrad: flaecheInfo?.anschlussgradObject?.grad_abkuerzung,
      anschlussgradKomplett: flaecheInfo?.anschlussgradObject?.grad,
      anteil: flaeche?.anteil,
      crossReference: flaeche?.anteil ? true : false,
      crossReferences: crossReferences,
      bemerkung: flaeche?.bemerkung,
      datumErfassung: flaeche?.datum_erfassung,
      datumVeranlagung: flaeche?.datum_veranlagung,
      type: flaecheInfo?.flaechenartObject?.art_abkuerzung,
      connection: flaecheInfo?.anschlussgradObject?.grad_abkuerzung,
      beschreibung: flaecheInfo?.flaechenbeschreibung?.beschreibung,
      id: flaeche?.id,
    };
  });

  return data;
};

export const sewerConnectionExtractor = (kassenzeichen) => {
  const sewegeConnection = kassenzeichen?.kanalanschlussObject;

  const getSelectValue = (angeschlossen) => {
    switch (angeschlossen) {
      case 0:
        return 'ja';
      case 1:
        return 'nein';
      case 2:
        return 'unklar';
      default:
        return '';
    }
  };

  return {
    rk: {
      vorhanden: sewegeConnection?.rkvorhanden,
      angeschlossen: getSelectValue(sewegeConnection?.rkangeschlossen),
    },
    mkr: {
      vorhanden: sewegeConnection?.mkrvorhanden,
      angeschlossen: getSelectValue(sewegeConnection?.mkrangeschlossen),
    },
    mks: {
      vorhanden: sewegeConnection?.mksvorhanden,
      angeschlossen: getSelectValue(sewegeConnection?.mksangeschlossen),
    },
    sk: {
      vorhanden: sewegeConnection?.skvorhanden,
      angeschlossen: getSelectValue(sewegeConnection?.skangeschlossen),
    },
    sg: {
      vorhanden: sewegeConnection?.sgvorhanden,
      entleerung: sewegeConnection?.sgentleerung,
    },
    kka: {
      vorhanden: sewegeConnection?.kkavorhanden,
      entleerung: sewegeConnection?.kkaentleerung,
    },
    evg: {
      vorhanden: sewegeConnection?.evg,
    },
  };
};

export const fileNumberExtractor = (kassenzeichen) => {
  const data =
    kassenzeichen?.kanalanschlussObject?.befreiungenunderlaubnisseArray?.map(
      (befreiungErlaubnis) => ({
        title:
          befreiungErlaubnis?.befreiungerlaubnisObject?.aktenzeichen +
          ' (' +
          befreiungErlaubnis?.befreiungerlaubnisObject
            ?.befreiungerlaubnis_nutzung?.name +
          ')',
        data: befreiungErlaubnis?.befreiungerlaubnisObject?.befreiungerlaubnis_geometrieArrayRelationShip?.map(
          (relationship) => ({
            title:
              relationship?.befreiungerlaubnis_geometrie_typ_versickerung
                ?.name ||
              relationship?.befreiungerlaubnis_geometrie_typ_einleitung?.name,
            value: relationship?.durchfluss + ' l/s',
          })
        ),
      })
    );

  return data;
};

export const exemptionExtractor = (kassenzeichen) => {
  const data =
    kassenzeichen?.kanalanschlussObject?.befreiungenunderlaubnisseArray?.map(
      (befreiungErlaubnis, i) => ({
        key: i,
        name:
          befreiungErlaubnis?.befreiungerlaubnisObject?.aktenzeichen +
          ' (' +
          befreiungErlaubnis?.befreiungerlaubnisObject
            ?.befreiungerlaubnis_nutzung?.name +
          ')',
        aktenzeichen:
          befreiungErlaubnis?.befreiungerlaubnisObject?.aktenzeichen,
        seepageFrom: befreiungErlaubnis?.befreiungerlaubnisObject?.antrag_vom,
        seepageUntil: befreiungErlaubnis?.befreiungerlaubnisObject?.gueltig_bis,
        useCase:
          befreiungErlaubnis?.befreiungerlaubnisObject
            ?.befreiungerlaubnis_nutzung?.name,
        type:
          befreiungErlaubnis?.befreiungerlaubnisObject
            ?.befreiungerlaubnis_geometrieArrayRelationShip[0]
            ?.befreiungerlaubnis_geometrie_typ_versickerung?.name ||
          befreiungErlaubnis?.befreiungerlaubnisObject
            ?.befreiungerlaubnis_geometrieArrayRelationShip[0]
            ?.befreiungerlaubnis_geometrie_typ_einleitung?.name,
        seepage:
          befreiungErlaubnis?.befreiungerlaubnisObject
            ?.befreiungerlaubnis_geometrieArrayRelationShip[0]?.durchfluss,
        gVerh:
          befreiungErlaubnis?.befreiungerlaubnisObject
            ?.befreiungerlaubnis_geometrieArrayRelationShip[0]
            ?.gutachten_vorhanden,
        bemerkung:
          befreiungErlaubnis?.befreiungerlaubnisObject
            ?.befreiungerlaubnis_geometrieArrayRelationShip[0]?.bemerkung,
        gewaessername:
          befreiungErlaubnis?.befreiungerlaubnisObject
            ?.befreiungerlaubnis_geometrieArrayRelationShip[0]?.gewaessername,
        id: befreiungErlaubnis?.id,
      })
    );

  return data;
};

export const frontsExtractor = (kassenzeichen) => {
  const data = kassenzeichen?.frontenArray?.map((row) => {
    const front = row?.frontObject;
    const frontInfo = front?.frontinfoObject;
    return {
      nummer: front?.nummer,
      laengeGrafik: frontInfo?.laenge_grafik,
      klasse: frontInfo?.lage_sr_satzung?.strassenreinigung?.key,
      id: frontInfo?.id,
      laengeKorrektur: frontInfo?.laenge_korrektur,
      bearbeitetDurch: front?.bearbeitet_durch,
      erfassungsdatum: front?.erfassungsdatum,
      straße: frontInfo?.strasseObject?.name,
      lage:
        frontInfo?.strasseObject?.name +
        (frontInfo?.lage_sr_satzung?.strassenreinigung?.key !== undefined &&
          ` (${frontInfo?.lage_sr_satzung?.strassenreinigung?.key})`),
      straßenReinigung: frontInfo?.lage_sr_satzung?.strassenreinigung?.name,
      bemerkung: frontInfo?.lage_sr_satzung?.sr_bem,
      veranlagung: frontInfo?.sr_veranlagung,
      garageStellplatz: frontInfo?.garage_stellplatz,
      anteil: frontInfo?.anteil,
      winkel: frontInfo?.winkel,
    };
  });

  return data;
};

export const geometryExtractor = (kassenzeichen) => {
  return kassenzeichen?.kassenzeichen_geometrienArray?.map((geometry) => ({
    title: geometry.kassenzeichen_geometrieObject.name,
    id: geometry.id,
  }));
};

export const alkisLandparcelExtractor = (landparcels) => {
  return landparcels?.map((landparcel) => ({
    title: landparcel.bezeichnung,
    id: landparcel.id,
  }));
};

export const mappingExtractor = ({
  kassenzeichen,
  flaechenArray,
  frontenArray,
  generalGeomArray,
  befreiungErlaubnisseArray,
  shownFeatureTypes,
  ondblclick,
}) => {
  if (kassenzeichen !== undefined && JSON.stringify(kassenzeichen) !== '{}') {
    const featureArray = [];
    const allFeatures = [
      ...(flaechenArray || []),
      ...(frontenArray || []),
      ...(generalGeomArray || []),
      ...(befreiungErlaubnisseArray || []),
    ];
    if (shownFeatureTypes.includes('front')) {
      //add frontenArray to featureArray
      featureArray.push(...(frontenArray || []));
    }
    if (shownFeatureTypes.includes('general')) {
      //add generalGeomArray to featureArray
      featureArray.push(...(generalGeomArray || []));
    }
    if (shownFeatureTypes.includes('flaeche')) {
      //add flaechenArray to featureArray
      featureArray.push(...(flaechenArray || []));
    }
    if (shownFeatureTypes.includes('befreiung')) {
      //add flaechenArray to featureArray
      featureArray.push(...(befreiungErlaubnisseArray || []));
    }

    let featureCollection;
    if (featureArray.length > 0) {
      featureCollection = featureArray;
    }

    return {
      _homeCenter: [51.272570027476256, 7.19963690266013],
      featureCollection,
      allFeatures,
      styler: createStyler(false, featureArray),
      markerStyle: getMarkerStyleFromFeatureConsideringSelection,
      showMarkerCollection: false,
      ondblclick,
    };
  }

  return {
    fallback: true,
    _homeCenter: [51.272570027476256, 7.19963690266013],
    _homeZoom: 16,
    ondblclick,
    featureCollection: undefined,
  };
};
