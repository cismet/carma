import { DMS_DOCUMENT_SERVER } from "../../constants/lagis";

export const D3_TYP = 100;

// Java's drag & drop saves dropped D3 links with typ 1, so the server counts too
export const isD3DmsUrl = (d) =>
  d.typ === D3_TYP || d.url.url_base.server.startsWith("d3one");

export const toDmsRow = (d) => ({ ...toRowOf(d), isD3: isD3DmsUrl(d) });

const toRowOf = (d) => {
  if (d.url.url_base.prot_prefix.startsWith("http")) {
    //dont change the server or other params for regular links
    const server = d.url.url_base.server;
    const protPrefix = d.url.url_base.prot_prefix;
    const urlBase = d.url.url_base.path;
    const finalPath = `${protPrefix}${server}${urlBase}${d.url.object_name}`;
    // http links to plain files (e.g. the document server) get their file icon
    const isD3 = isD3DmsUrl(d);

    return {
      id: d.id,
      name: d.name,
      beschreibung:
        d.beschreibung === null && server.startsWith("d3one")
          ? "D3-Link"
          : d.beschreibung,
      file: d.url.object_name,
      vorschau: finalPath,
      fileType: isD3
        ? "d3"
        : detectFileWithoutIcon(
            d.url.object_name.split("?")[0].split(".").pop()
          ),
    };
  } else {
    const server = DMS_DOCUMENT_SERVER;
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
};

export function dmsPageExtractor(dataIn) {
  if (dataIn === undefined) {
    return [];
  }
  return (dataIn?.dms_urlArrayRelationShip || []).map(toDmsRow);
}

export function detectFileWithoutIcon(fileType) {
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
