import { Doc } from "@carma-commons/document-viewer";

const tileservice = "https://resources-wuppertal.cismet.de/tiles/";

const createTitleForFilenameForAdditionalDocuments = (
  filename: string
): string => {
  // Remove FNP_XXXX_XXXAnd prefix and .pdf extension
  return filename.replace(/^FNP_\d+_\d+And_/, "").replace(/\.pdf$/, "");
};
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
        aev.verfahren === ""
          ? "FNP-Änderung " + aev.name
          : "FNP-Berichtigung " + aev.name;
      const filename =
        aev.verfahren === ""
          ? "FNP-Änderung." + aev.name + ".pdf"
          : "FNP-Berichtigung." + aev.name + ".pdf";
      docs.push({
        group: "/Änderungsverfahren",
        primary: true,

        file: filename,
        url: aev.url.replace(
          "http://www.wuppertal.de/geoportal/",
          "https://wunda-geoportal-docs.cismet.de/"
        ),
        layer: replaceUmlauteAndSpaces(
          aev.url.replace("http://www.wuppertal.de/geoportal/", tileservice) +
            "/{z}/{x}/{y}.png"
        ),
        meta: replaceUmlauteAndSpaces(
          aev.url.replace("http://www.wuppertal.de/geoportal/", tileservice) +
            "/meta.json"
        ),
        title: title,
      });

      if (aev.docUrls.length > 0) {
        let url =
          "https://www.wuppertal.de/geoportal/fnp_dokumente/Info_FNP-Zusatzdokumente_WUP.pdf";
        docs.push({
          primary: false,

          group: "/Zusatzdokumente",
          //structure: "/Zusatzdokumente",
          title: "Info Dateinamen",
          file: "Info_FNP-Zusatzdokumente_WUP.pdf",
          url: url.replace(
            "https://www.wuppertal.de/geoportal/",
            "https://wunda-geoportal-docs.cismet.de/"
          ),
          layer: replaceUmlauteAndSpaces(
            url.replace("https://www.wuppertal.de/geoportal/", tileservice) +
              "/{z}/{x}/{y}.png"
          ),
          meta: replaceUmlauteAndSpaces(
            url.replace("https://www.wuppertal.de/geoportal/", tileservice) +
              "/meta.json"
          ),
        });
      }
      for (let docObject of aev.docUrls) {
        const url = docObject.url;
        const file = docObject.file;
        const structure = docObject.structure;
        const title = docObject.title;
        const d = {
          primary: false,
          group: "Zusatzdokumente" + structure,
          structure,
          title,

          file,
          url,
          layer: replaceUmlauteAndSpaces(
            url.replace(
              "https://wunda-geoportal-docs.cismet.de/",
              tileservice
            ) + "/{z}/{x}/{y}.png"
          ),
          // TODO fix type here:
          meta: replaceUmlauteAndSpaces(
            url.replace(
              "https://wunda-geoportal-docs.cismet.de/",
              tileservice
            ) + "/meta.json"
          ),
        };
        docs.push(d);
      }
    }
  });

  return docs;
}

export async function getDocsForStaticEntry(props) {
  let { docPackageIdParam } = props;
  let title = "-";

  let urlToGetDocsFrom =
    tileservice + "/static/docs/" + docPackageIdParam + ".json";
  console.log("urlToGetDocsFrom", urlToGetDocsFrom);

  const response = await fetch(urlToGetDocsFrom, {
    method: "get",
    headers: {
      "Content-Type": "text/plain; charset=UTF-8",
    },
  });

  const result = await response.json();
  title = result.title;
  let docs = result.docs;
  for (let d of docs) {
    if (d.tilebase === undefined && result.tilereplacementrule !== undefined) {
      d.tilebase = d.url.replace(
        result.tilereplacementrule[0],
        result.tilereplacementrule[1]
      );
    }
    if (d.layer === undefined) {
      d.layer = d.tilebase + "/{z}/{x}/{y}.png";
    }
    if (d.meta === undefined) {
      d.meta = d.tilebase + "/meta.json";
    }

    if (d.file === undefined) {
      d.file = d.url.substring(d.url.lastIndexOf("/") + 1);
    }
  }

  return docs;
}
