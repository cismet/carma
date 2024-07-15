import { Doc } from '@carma-commons/document-viewer';

const tileservice = 'https://resources.cismet.de/tiles/';

function replaceUmlauteAndSpaces(str: string) {
  const umlautMap = {
    Ü: 'UE',
    Ä: 'AE',
    Ö: 'OE',
    ü: 'ue',
    ä: 'ae',
    ö: 'oe',
    ß: 'ss',
    ' ': '_',
  } as {
    [key: string]: string;
  };
  let ret = str
    .replace(/[\u00dc|\u00c4|\u00d6][a-z]/g, (a: string) => {
      var big = umlautMap[a.slice(0, 1)];
      return big.charAt(0) + big.charAt(1) + a.slice(1);
    })
    .replace(
      new RegExp('[' + Object.keys(umlautMap).join('|') + ']', 'g'),
      (a: any) => umlautMap[a]
    );
  return ret;
}

function repairUrl(url) {
  return url
    .replace('http://', 'https://')
    .replace(
      'https://www.wuppertal.de/geoportal/',
      'https://wunda-geoportal-docs.cismet.de/'
    );
}

export function getDocsForBPlaeneGazetteerEntry(props: any) {
  let {
    gazHit,
    // searchForPlans,
    getPlanFeatureByGazObject,
  } = props;
  let docs: any = [];

  getPlanFeatureByGazObject([gazHit], (bplanFeature) => {
    let bplan;

    if (bplanFeature.length > 0) {
      bplan = bplanFeature[0].properties;
    }

    if (bplan) {
      let title = 'B-Plan ' + bplan?.nummer;

      for (const doc of bplan.plaene_rk) {
        docs.push({
          group: 'rechtskraeftig',
          file: doc.file,
          url: doc.url,
          docTitle: title,

          layer: replaceUmlauteAndSpaces(
            repairUrl(doc.url).replace(
              'https://wunda-geoportal-docs.cismet.de/',
              tileservice
            ) + '/{z}/{x}/{y}.png'
          ),
          meta: replaceUmlauteAndSpaces(
            repairUrl(doc.url).replace(
              'https://wunda-geoportal-docs.cismet.de/',
              tileservice
            ) + '/meta.json'
          ),
        });
      }

      for (const doc of bplan.plaene_nrk) {
        docs.push({
          group: 'nicht_rechtskraeftig',
          file: doc.file,
          url: repairUrl(doc.url),
          docTitle: title,

          layer: replaceUmlauteAndSpaces(
            repairUrl(doc.url).replace(
              'https://wunda-geoportal-docs.cismet.de/',
              tileservice
            ) + '/{z}/{x}/{y}.png'
          ),
          meta: replaceUmlauteAndSpaces(
            repairUrl(doc.url).replace(
              'https://wunda-geoportal-docs.cismet.de/',
              tileservice
            ) + '/meta.json'
          ),
        });
      }
      for (const doc of bplan.docs) {
        docs.push({
          group: 'Zusatzdokumente',
          file: doc.file,
          url: repairUrl(doc.url),
          hideInDocViewer: doc.hideInDocViewer,
          layer: replaceUmlauteAndSpaces(
            repairUrl(doc.url).replace(
              'https://wunda-geoportal-docs.cismet.de/',
              tileservice
            ) + '/{z}/{x}/{y}.png'
          ),

          meta: replaceUmlauteAndSpaces(
            repairUrl(doc.url).replace(
              'https://wunda-geoportal-docs.cismet.de/',
              tileservice
            ) + '/meta.json'
          ),
        });
      }
    }
  });
  return docs;
}
