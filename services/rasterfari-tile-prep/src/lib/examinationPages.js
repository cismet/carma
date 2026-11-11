import ColorHash from 'color-hash';
import fs from 'fs-extra';
import { getBaseUrl, getDocFromUrl, getDB, getTileCheckUrls } from './tilesTools';
import { slack } from '../processing';

const chunk = (arr, size) =>
  arr.reduce((acc, _, i) => (i % size ? acc : [...acc, arr.slice(i, i + size)]), []);

const getColor = (line) => {
  let colorHash = new ColorHash({ saturation: 0.3 });

  return colorHash.hex('' + line);
};
const docViewerService = 'https://wunda-geoportal.cismet.de';
//const docViewerService = 'http://localhost:3000';

export default function produceExaminationPagesFromZoomLevelzeroUrls(
  topicname,
  outFolderForChecks,
  zoomlevelzerourls
) {
  let counter = 0;
  let imagelinks = [];

  for (const check of zoomlevelzerourls) {
    let c = getColor(
      check.index + 1 + '.' + check.key + '...' + (check.index + 1) + '...' + check.doc.file
    );
    let docid;
    if (topicname === 'bplaene') {
      docid = 'bplaene';
    } else if ((topicname = 'aev')) {
      docid = 'aenderungsv';
    } else {
      '######## ERROR: unknown topic' +
        topicname +
        ' (produceExaminationPagesFromZoomLevelzeroUrls has to be bextended)';
    }

    imagelinks.push(
      '<div style="float: left;"><a target="_docviewer" href="' +
        docViewerService +
        '/#/docs/' +
        docid +
        '/' +
        check.key +
        '/' +
        (check.index + 1) +
        '/' +
        (check.page + 1) +
        '"><img style="background:' +
        c +
        ';" title="' +
        check.key +
        '.' +
        (check.index + 1) +
        '.' +
        (check.page + 1) +
        '" src="' +
        check.humantesturl +
        '"/></a><div> &uarr;' +
        check.key +
        '/' +
        (check.index + 1) +
        '/' +
        (check.page + 1) +
        ' &uarr;</div></div>\n'
    );
  }
  let chunks = chunk(imagelinks, 500);

  let chunkIndex = 0;
  let firstLink;
  for (const c of chunks) {
    let examinationPageHtml =
      '<html><head><meta charset="UTF-8"></head><style>body {font-family: Arial;}</style>';
    let next, prev;
    if (chunkIndex !== chunks.length - 1) {
      next = '<a href="examination-' + (chunkIndex + 1) + '.html"> &gt;&gt; </a>';
    }
    if (chunkIndex !== 0) {
      prev = '<a href="examination-' + (chunkIndex - 1) + '.html"> &lt;&lt; </a>';
    }
    examinationPageHtml +=
      '<h1 align="center"> ' +
      (prev || '') +
      (chunkIndex + 1) +
      '/' +
      chunks.length +
      (next || '') +
      '</h1>\n';
    for (let imageLine of c) {
      examinationPageHtml += imageLine;
    }

    examinationPageHtml +=
      '<div style="clear:both;"><h1 align="center"> ' +
      (prev || '') +
      (chunkIndex + 1) +
      '/' +
      chunks.length +
      (next || '') +
      '</h1></div>\n';

    examinationPageHtml += '</html>';
    const dir = outFolderForChecks + '/';
    fs.ensureDirSync(dir);

    const fileName = dir + 'examination-' + chunkIndex + '.html';
    console.log('write ' + fileName);

    fs.writeFileSync(fileName, examinationPageHtml, 'utf8');
    if (firstLink === undefined) {
      firstLink = fileName;
    }
    chunkIndex++;
  }
  if (firstLink !== undefined) {
    slack(
      topicname,
      'Preview: https://tilechecks-wupp.cismet.de' + firstLink.replace(/.*checks/, '')
    );
  } else {
    slack(topicname, 'No preview for you');
  }
}

export async function produceExaminationPagesFromTilesFolder(
  topicname,
  tilesFolder,
  examinationPagesFolder
) {
  console.log('produceExaminationPagesFromTilesFolder for ' + topicname);
  console.log('tilesFolder=' + tilesFolder);
  console.log('examinationPagesFolder=' + examinationPagesFolder);

  //const data = await getDataForTopic(topicname);

  let urls = [];
  let potFolders = [];
  if (topicname === 'bplaene') {
    let bplaene = await getDB(topicname);

    potFolders = [
      '/bplaene/rechtswirksam/',
      '/bplaene/verfahren/',
      '/bplaene_dokumente/abgelaufen/',
      '/bplaene_dokumente/im_Verfahren/',
      '/bplaene_dokumente/rechtsverbindlich/',
    ];
    console.log('bplaene.length', bplaene.length);

    for (let bpl of bplaene) {
      let allUrls = bpl.m.plaene_rk.concat(bpl.m.plaene_nrk, bpl.m.docs);
      let docIndex = 0;
      let planSection = true;
      let x = 0;
      for (let url of allUrls) {
        if (planSection && bpl.m.docs.indexOf(url) !== -1) {
          planSection = false;
          docIndex++; //increment index because of the describing meta document (first document after the real plans)
        }
        urls.push({
          nummer: bpl.s,
          index: docIndex++,
          url: getBaseUrl(url.url).replace('https://aaa.cismet.de/tiles', ''),
        });
      }
    }
  } else if (topicname === 'aev') {
    let aevs = await getDB(topicname);
    potFolders = [
      '/FNP_Aenderungen/Karten/',
      '/fnp_dokumente/im_Verfahren/',
      '/fnp_dokumente/rechtsverbindlich/',
    ];

    for (let aev of aevs) {
      let docIndex = 0;

      urls.push({
        nummer: aev.name,
        index: docIndex++,
        url: getBaseUrl(aev.url).replace('https://aaa.cismet.de/tiles', ''),
      });
      if (aev.docUrls.length > 0) {
        docIndex++; //increment index because of the describing meta document (first document after the real plans)
      }
      for (const durl of aev.docUrls) {
        urls.push({
          nummer: aev.name,
          index: docIndex++,
          url: getBaseUrl(durl).replace('https://aaa.cismet.de/tiles', ''),
        });
      }
    }
  } else if (topicname.startsWith('static')) {
    slack(topicname, 'no preview at the moment for static documents');
  } else {
    console.log(
      '######## ERROR: unknown topic' +
        topicname +
        ' (produceExaminationPagesFromTilesFolder has to be bextended)'
    );
  }

  console.log('urls.length', urls.length);

  let hits = [];
  for (let folder of potFolders) {
    try {
      // console.log('try ' + tilesFolder + folder);
      let filesInFolder = fs.readdirSync(tilesFolder + folder);
      console.log('hit ' + tilesFolder + folder);

      for (let file of filesInFolder) {
        let found = urls.filter((x) => {
          return x.url === folder + file;
        });

        if (found.length > 0) {
          hits = hits.concat(found);
        }
      }
    } catch (e) {
      // console.log('failed ' + tilesFolder + folder);
      // console.log('error desc', e);
    }
  }

  let metaInfErrors = [];

  let zoomlevelzerourls = [];
  for (let hit of hits) {
    let metaInfUrl = tilesFolder + hit.url + '/meta.json';

    let metaInf;
    try {
      metaInf = JSON.parse(fs.readFileSync(metaInfUrl, 'utf8'));
    } catch (e) {
      metaInfErrors.push(hit);
    }
    if (metaInf) {
      for (let p = 0; p < metaInf.pages; ++p) {
        let zoomlevelzerourl = {
          key: hit.nummer,
          doc: {
            file: 'not needed',
            url: hit.url,
          },
          index: hit.index,
          page: p,
          humantesturl: getTileCheckUrls(
            'https://aaa.cismet.de/tiles/' + hit.url,
            metaInf.pages,
            p,
            1
          )[0],
        };
        zoomlevelzerourls.push(zoomlevelzerourl);
      }
    }
  }

  console.log('Anzahl Layer', hits.length);
  slack(topicname, 'Number of created Tile-Layers: ' + hits.length);
  console.log('Anzahl metaInf Errors', metaInfErrors.length);
  for (let error of metaInfErrors) {
    console.log(
      'Fehler in der metaInf Datei der folgenden Url. Wahrscheinlich bei der Konvertierung des PDF etwas schiefgegangen.',
      error
    );
  }

  produceExaminationPagesFromZoomLevelzeroUrls(
    topicname,
    examinationPagesFolder,
    zoomlevelzerourls
  );
}
