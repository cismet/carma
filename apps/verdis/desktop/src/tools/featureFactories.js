export const getFlaechenFeatureCollection = (kassenzeichen) => {
  // Extract the flaechenArray from the response
  const flaechenArray = kassenzeichen.flaechenArray;

  // Map through the flaechenArray to create the features
  const features = flaechenArray.map((flaeche) => {
    return {
      type: 'Feature',
      featureType: 'flaeche',
      id: flaeche.flaecheObject.id,
      geometry: flaeche.flaecheObject.flaecheninfoObject.geom.geo_field,
      crs: flaeche.flaecheObject.flaecheninfoObject.geom.geo_field.crs,
      properties: {
        id: 'flaeche.' + flaeche.flaecheObject.id,
        kassenzeichen: kassenzeichen.kassenzeichennummer8,
        bez: flaeche.flaecheObject.flaechenbezeichnung,
        bezeichnung: flaeche.flaecheObject.flaechenbezeichnung,
        art_abk:
          flaeche.flaecheObject.flaecheninfoObject.flaechenartObject
            .art_abkuerzung,
        flaechenart:
          flaeche.flaecheObject.flaecheninfoObject.flaechenartObject.art,
        anschlussgrad:
          flaeche.flaecheObject.flaecheninfoObject.anschlussgradObject.grad,
        groesse: flaeche.flaecheObject.flaecheninfoObject.groesse_aus_grafik,
        groesse_korrektur:
          flaeche.flaecheObject.flaecheninfoObject.groesse_korrektur,
        geom: undefined, // Exclude the geom in the properties
      },
    };
  });

  return features;
};

export const getFrontenFeatureCollection = (kassenzeichen) => {
  // extract the frontenArray from the response
  const frontenArray = kassenzeichen.frontenArray;
  const features = frontenArray.map((front) => {
    const frontObject = front.frontObject;
    return {
      type: 'Feature',
      featureType: 'front',
      id: 'front.' + frontObject.frontinfoObject.id,
      geometry: frontObject.frontinfoObject.geom.geo_field,
      crs: frontObject.frontinfoObject.geom.geo_field.crs,
      properties: {
        id: frontObject.frontinfoObject.id,
        kassenzeichen: kassenzeichen.kassenzeichennummer8,
        bezeichnung: frontObject.nummer,
        strassenreinigung: frontObject.frontinfoObject.strassenreinigung,
        winterdienst: frontObject.frontinfoObject.winterdienst,
        wd_prio_or: frontObject.frontinfoObject.wd_prio_or,
        sr_klasse_or: frontObject.frontinfoObject.sr_klasse_or,
        strasse: frontObject.frontinfoObject.strasseObject,
        lage_sr_satzung: frontObject.frontinfoObject.lage_sr_satzung,
        lage_wd_satzung: frontObject.frontinfoObject.lage_wd_satzung,
      },
    };
  });

  return features;
};

export const getGeneralGeomfeatureCollection = (kassenzeichen) => {
  // extract the general Geom Array from the response

  const generalGeomArray = kassenzeichen.kassenzeichen_geometrienArray;

  const features = generalGeomArray.map((geom) => {
    const geomObject = geom.kassenzeichen_geometrieObject;
    return {
      type: 'Feature',
      featureType: 'general',
      id: 'general.' + geom.id,
      geometry: geomObject.geom.geo_field,
      crs: geomObject.geom.geo_field.crs,
      properties: {
        id: geom.id,
        name: geomObject.name,
        isfrei: geomObject.isfrei,
        kassenzeichen: kassenzeichen.kassenzeichennummer8,
        bezeichnung: geomObject.name,
      },
    };
  });

  return features;
};

export const getVersickerungsGenFeatureCollection = (kassenzeichen) => {
  const befreiungErlaubnissArray =
    kassenzeichen?.kanalanschlussObject?.befreiungenunderlaubnisseArray || [];

  const features = [];
  befreiungErlaubnissArray.map((befrErlaubnis) => {
    const befErl = befrErlaubnis.befreiungerlaubnisObject;

    const subfeatures =
      befErl.befreiungerlaubnis_geometrieArrayRelationShip.map(
        (befrErlaubnisGeom) => {
          return {
            type: 'Feature',
            featureType: 'befreiung',
            id: 'befreiung.' + befrErlaubnisGeom.id,
            geometry: befrErlaubnisGeom.geom.geo_field,
            crs: befrErlaubnisGeom.geom.geo_field.crs,
            properties: {
              id: befrErlaubnisGeom.id,
              aktenzeichen: befErl.aktenzeichen,
              antrag_vom: befErl.antrag_vom,
              gueltig_bis: befErl.gueltig_bis,
              befreiungerlaubnis_nutzung:
                befErl.befreiungerlaubnis_nutzung?.name,

              typEinleitung:
                befrErlaubnisGeom.befreiungerlaubnis_geometrie_typ_einleitung
                  ?.name,
              typVersickerung:
                befrErlaubnisGeom.befreiungerlaubnis_geometrie_typ_versickerung
                  ?.name,
              bemerkung: befrErlaubnisGeom.bemerkung,
              durchfluss: befrErlaubnisGeom.durchfluss,
              gewaessername: befrErlaubnisGeom.gewaessername,
              gutachten_vorhanden: befrErlaubnisGeom.gutachten_vorhanden,
            },
          };
        }
      );
    features.push(...subfeatures);
  });

  return features;
};
