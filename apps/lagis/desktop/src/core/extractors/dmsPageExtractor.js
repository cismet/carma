export function dmsPageExtractor(dataIn) {
  if (dataIn === undefined) {
    return [];
  } else {
    const dms = dataIn?.dms_urlArrayRelationShip || [];
    if (dms.length > 0) {
      const data = dms.map((d) => {
        // console.log("xxx d", d);
        if (d.url.url_base.prot_prefix.startsWith("http")) {
          //dont change the server or other params for regular links
          const server = d.url.url_base.server;
          const protPrefix = d.url.url_base.prot_prefix;
          const urlBase = d.url.url_base.path;
          const finalPath = `${protPrefix}${server}${urlBase}${d.url.object_name}`;

          // console.log("xxx finalPath", finalPath);

          return {
            id: d.id,
            name: d.name,
            beschreibung:
              d.beschreibung === null && server.startsWith("d3one")
                ? "D3-Link"
                : d.beschreibung,
            file: d.url.object_name,
            vorschau: finalPath,
            fileType: "d3",
          };
        } else {
          const server = "http://dokumente.s10222.wuppertal-intra.de";
          const fileName = d.url.object_name;
          const fileType = fileName.split(".");
          const urlBase = d.url.url_base.path;
          const pathParts = urlBase.split("\\");
          pathParts[1] = pathParts[1]?.toLowerCase();
          const modifiedPath = pathParts.join("/");
          const finalPath = `${server}${modifiedPath}${fileName.replace(
            /\s/g,
            "%20"
          )}`;
          return {
            id: d.id,
            name: d.name,
            beschreibung: d.beschreibung === null ? "" : d.beschreibung,
            file: d.url.object_name,
            vorschau: finalPath,
            fileType: detectFileWithoutIcon(fileType[fileType.length - 1]),
          };
        }
      });

      return data;
    }

    return [];
  }
}

function detectFileWithoutIcon(fileType) {
  if (
    fileType === "TIF" ||
    fileType === "tif" ||
    fileType === "JPG" ||
    fileType === "txt" ||
    fileType === "TXT" ||
    fileType === "doc" ||
    fileType === "docx" ||
    fileType === "PDF" ||
    fileType === "pdf" ||
    fileType === "xlsx" ||
    fileType === "xls" ||
    fileType === "msg"
  ) {
    return fileType;
  } else {
    return "";
  }
}
