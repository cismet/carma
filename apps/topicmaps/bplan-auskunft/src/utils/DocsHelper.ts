import { Doc } from "@carma-commons/document-viewer";

const tileservice = "https://resources-wuppertal.cismet.de/tiles/";

function replaceUmlauteAndSpaces(str: string) {
  const umlautMap = {
    Ü: "UE",
    Ä: "AE",
    Ö: "OE",
    ü: "ue",
    ä: "ae",
    ö: "oe",
    ß: "ss",
    " ": "_",
  } as {
    [key: string]: string;
  };
  let ret = str
    .replace(/[\u00dc|\u00c4|\u00d6][a-z]/g, (a: string) => {
      var big = umlautMap[a.slice(0, 1)];
      return big.charAt(0) + big.charAt(1) + a.slice(1);
    })
    .replace(
      new RegExp("[" + Object.keys(umlautMap).join("|") + "]", "g"),
      (a: any) => umlautMap[a]
    );
  return ret;
}

function repairUrl(url) {
  return url
    .replace("http://", "https://")
    .replace(
      "https://www.wuppertal.de/geoportal/",
      "https://wunda-geoportal-docs.cismet.de/"
    );
}

export function getTitleFromFilename(filename: string) {
  let title = filename;
  //replace the first B with the word B-Plan
  title = title.replace("B", "B-Plan");
  return title;
}

export function getDocsForBPlanFeature(props: any) {
  const { bplanFeature } = props;
  let docs: any = [];
  const bplan = bplanFeature.properties;

  if (bplan) {
    for (const doc of bplan.plaene_rk) {
      docs.push({
        primary: true,
        group: "rechtskräftig",
        file: doc.file,
        url: doc.url,
        title: getTitleFromFilename(doc.file),

        layer: replaceUmlauteAndSpaces(
          repairUrl(doc.url).replace(
            "https://wunda-geoportal-docs.cismet.de/",
            tileservice
          ) + "/{z}/{x}/{y}.png"
        ),
        meta: replaceUmlauteAndSpaces(
          repairUrl(doc.url).replace(
            "https://wunda-geoportal-docs.cismet.de/",
            tileservice
          ) + "/meta.json"
        ),
      });
    }

    for (const doc of bplan.plaene_nrk) {
      docs.push({
        primary: true,
        group: "nicht rechtskräftig",
        file: doc.file,
        url: repairUrl(doc.url),
        title: getTitleFromFilename(doc.file),

        layer: replaceUmlauteAndSpaces(
          repairUrl(doc.url).replace(
            "https://wunda-geoportal-docs.cismet.de/",
            tileservice
          ) + "/{z}/{x}/{y}.png"
        ),
        meta: replaceUmlauteAndSpaces(
          repairUrl(doc.url).replace(
            "https://wunda-geoportal-docs.cismet.de/",
            tileservice
          ) + "/meta.json"
        ),
      });
    }
    for (const doc of bplan.docs) {
      docs.push({
        primary: false,

        group:
          "/Zusatzdokumente" +
          (doc.structure !== undefined ? doc.structure : ""),
        file: doc.file,
        url: repairUrl(doc.url),
        title: doc.title,
        structure: doc.structure,
        hideInDocViewer: doc.hideInDocViewer,
        layer: replaceUmlauteAndSpaces(
          repairUrl(doc.url).replace(
            "https://wunda-geoportal-docs.cismet.de/",
            tileservice
          ) + "/{z}/{x}/{y}.png"
        ),

        meta: replaceUmlauteAndSpaces(
          repairUrl(doc.url).replace(
            "https://wunda-geoportal-docs.cismet.de/",
            tileservice
          ) + "/meta.json"
        ),
      });
    }

    return docs;
  }
}

export function getDocsForBPlanTitle(props: any) {
  let {
    title,
    // searchForPlans,
    getPlanFeatureByTitle,
  } = props;
  let docs: any = [];

  getPlanFeatureByTitle(title, (bplanFeature) => {
    docs = getDocsForBPlanFeature({ bplanFeature });
  });
  return docs;
}
