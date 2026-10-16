import { nanoid } from "@reduxjs/toolkit";
import { deleteDmsUrl, fetchDmsForEdit, insertDmsUrl } from "../wizard/api";
import { toDmsRow } from "../extractors/dmsPageExtractor";

// Java's typ for a dropped file or link (100 is D3)
const LINK_TYP = 1;

const toRow = (dmsUrl) => ({
  ...toDmsRow(dmsUrl),
  id: String(dmsUrl.id),
  dmsId: dmsUrl.id,
  savedUrl: {
    object_name: dmsUrl.url.object_name,
    url_base: { ...dmsUrl.url.url_base },
  },
  typ: dmsUrl.typ,
  // the view shows "" or "D3-Link" for null
  savedBeschreibung: dmsUrl.beschreibung,
  link: "",
});

export const loadDmsSection = async (schluesselId, jwt) => {
  const flurstueck = await fetchDmsForEdit(schluesselId, jwt);
  return (
    flurstueck && {
      flurstueckId: flurstueck.id,
      dokumente: (flurstueck.dms_urlArrayRelationShip ?? []).map(toRow),
    }
  );
};

export const newDmsRow = () => ({
  id: nanoid(),
  name: "",
  link: "",
  beschreibung: "",
});

// Port of cismet URLSplitter: "https://host/dir/file" or a UNC path
// "\\host\share\dir\file" into the url_base parts and the object name.
export const splitLink = (link) => {
  let rest = link.trim();
  let protPrefix = "";
  let separator = "/";
  const scheme = rest.indexOf("://");
  if (scheme > 0) {
    protPrefix = rest.slice(0, scheme + 3);
    rest = rest.slice(scheme + 3);
  } else if (rest.startsWith("\\\\")) {
    protPrefix = "\\\\";
    rest = rest.slice(2);
    separator = "\\";
  }
  let server = "";
  const serverEnd = rest.indexOf(separator);
  if (serverEnd !== -1) {
    server = rest.slice(0, serverEnd);
    rest = rest.slice(serverEnd);
  }
  const pathEnd = Math.max(rest.lastIndexOf("/"), rest.lastIndexOf("\\"));
  return {
    prot_prefix: protPrefix,
    server,
    path: rest.slice(0, pathEnd + 1),
    object_name: rest.slice(pathEnd + 1),
  };
};

export const isDmsLink = (link) => {
  const { prot_prefix, server, object_name } = splitLink(link ?? "");
  return Boolean(prot_prefix && server && object_name);
};

// A link dragged from a browser comes as text/uri-list (# lines are
// comments), a selected address as plain text. Dropped files carry no path.
export const linkFromDrop = (dataTransfer) => {
  const text =
    dataTransfer.getData("text/uri-list") || dataTransfer.getData("text/plain");
  return (
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith("#")) ?? ""
  );
};

export const dmsRowFromLink = (link) => {
  const { object_name, server } = splitLink(link);
  let name = object_name.split("?")[0] || server;
  try {
    name = decodeURIComponent(name);
  } catch (e) {
    // keep the encoded name
  }
  return { ...newDmsRow(), name, link };
};

// view cells of a new row, built the same way as for saved ones
export const previewOf = (row) => {
  if (!isDmsLink(row.link)) {
    return { file: "", vorschau: "", fileType: undefined };
  }
  const parts = splitLink(row.link);
  const { file, vorschau, fileType } = toDmsRow({
    beschreibung: row.beschreibung,
    url: { object_name: parts.object_name, url_base: parts },
  });
  return { file, vorschau, fileType };
};

const text = (value) => String(value ?? "").trim() || null;

// Like Java: always a new url_base and url, existing documents can only be
// removed. The undo of a delete restores the link with a new url row.
export const saveDmsEdit = async (original, draft, ctx) => {
  const { jwt, journal } = ctx;
  const { flurstueckId } = original;

  for (const row of draft.dokumente.filter((row) => !row.dmsId)) {
    const { object_name, ...urlBase } = splitLink(row.link);
    const name = text(row.name);
    const id = await insertDmsUrl(
      {
        fk_flurstueck: flurstueckId,
        typ: LINK_TYP,
        name,
        beschreibung: text(row.beschreibung),
        url: { object_name, url_base: urlBase },
      },
      jwt
    );
    journal.record(`Neues Dokument ${name}`, () => deleteDmsUrl(id, jwt));
  }

  const kept = new Set(draft.dokumente.map((row) => row.dmsId));
  for (const row of original.dokumente.filter((row) => !kept.has(row.dmsId))) {
    await deleteDmsUrl(row.dmsId, jwt);
    journal.record(`Gelöschtes Dokument ${row.name}`, () =>
      insertDmsUrl(
        {
          fk_flurstueck: flurstueckId,
          typ: row.typ,
          name: row.name,
          beschreibung: row.savedBeschreibung,
          url: row.savedUrl,
        },
        jwt
      )
    );
  }
};
