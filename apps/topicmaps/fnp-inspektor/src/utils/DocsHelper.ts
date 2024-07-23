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

export function getDocsForAEVGazetteerEntry(props: any) {
  let { gazHit, searchForAEVs } = props;
  let docs: Doc[] = [];

  searchForAEVs([gazHit], (aevFeatures: any) => {
    let aev;

    if (aevFeatures.length > 0) {
      aev = aevFeatures[0].properties;
    }

    if (aev) {
      let title =
        aev.verfahren === ''
          ? 'FNP-Änderung ' + aev.name
          : 'FNP-Berichtigung ' + aev.name;
      const filename =
        aev.verfahren === ''
          ? 'FNP-Änderung.' + aev.name + '.pdf'
          : 'FNP-Berichtigung.' + aev.name + '.pdf';
      docs.push({
        group: 'Änderungsverfahren',
        file: filename,
        url: aev.url.replace(
          'http://www.wuppertal.de/geoportal/',
          'https://wunda-geoportal-docs.cismet.de/'
        ),
        layer: replaceUmlauteAndSpaces(
          aev.url.replace('http://www.wuppertal.de/geoportal/', tileservice) +
            '/{z}/{x}/{y}.png'
        ),
        meta: replaceUmlauteAndSpaces(
          aev.url.replace('http://www.wuppertal.de/geoportal/', tileservice) +
            '/meta.json'
        ),
        title: title,
      });

      if (aev.docUrls.length > 0) {
        let url =
          'https://www.wuppertal.de/geoportal/fnp_dokumente/Info_FNP-Zusatzdokumente_WUP.pdf';
        docs.push({
          group: 'Zusatzdokumente',
          title: 'Info Dateinamen',
          file: 'Info_FNP-Zusatzdokumente_WUP.pdf',
          url: url.replace(
            'https://www.wuppertal.de/geoportal/',
            'https://wunda-geoportal-docs.cismet.de/'
          ),
          layer: replaceUmlauteAndSpaces(
            url.replace('https://www.wuppertal.de/geoportal/', tileservice) +
              '/{z}/{x}/{y}.png'
          ),
          meta: replaceUmlauteAndSpaces(
            url.replace('https://www.wuppertal.de/geoportal/', tileservice) +
              '/meta.json'
          ),
        });
      }

      for (let url of aev.docUrls) {
        const filename = url.substring(url.lastIndexOf('/') + 1);
        docs.push({
          group: 'Zusatzdokumente',
          file: filename,
          url: url.replace(
            'https://www.wuppertal.de/geoportal/',
            'https://wunda-geoportal-docs.cismet.de/'
          ),
          layer: replaceUmlauteAndSpaces(
            url.replace('https://www.wuppertal.de/geoportal/', tileservice) +
              '/{z}/{x}/{y}.png'
          ),
          // TODO fix type here:
          meta: replaceUmlauteAndSpaces(
            url.replace('https://www.wuppertal.de/geoportal/', tileservice) +
              '/meta.json'
          ),
        });
      }
    }
  });

  return docs;
}
