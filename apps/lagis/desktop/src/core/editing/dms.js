import { nanoid } from "@reduxjs/toolkit";
import {
  deleteDmsUrl,
  fetchDmsForEdit,
  fetchUrlBaseId,
  insertDmsUrl,
} from "../wizard/api";
import { D3_TYP, isD3DmsUrl, toDmsRow } from "../extractors/dmsPageExtractor";
import { D3_BASE_URL } from "../../constants/lagis";

// Java's typ for a dropped file or link
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
  const dmsUrls = flurstueck?.dms_urlArrayRelationShip ?? [];
  return (
    flurstueck && {
      flurstueckId: flurstueck.id,
      d3: dmsUrls.filter(isD3DmsUrl).map(toRow),
      dokumente: dmsUrls.filter((d) => !isD3DmsUrl(d)).map(toRow),
    }
  );
};

export const newD3Row = () => ({
  id: nanoid(),
  name: "",
  d3Id: "",
});

export const d3LinkOf = (d3Id) => D3_BASE_URL + d3Id.trim();

// "" when the link isn't a D3 one
export const d3IdFromLink = (link) => {
  const { server, object_name } = splitLink(link);
  return server.startsWith("d3one") ? object_name.split(/[?#]/)[0] : "";
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

export const d3RowFromLink = (link) => ({
  ...newD3Row(),
  d3Id: d3IdFromLink(link),
});

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

// Java reuses the D3 url_base and creates one only when it's missing
const d3UrlBase = async (jwt) => {
  const { object_name, ...parts } = splitLink(D3_BASE_URL);
  const id = await fetchUrlBaseId(parts, jwt);
  return id ? { id } : parts;
};

// Saved documents can only be removed. A file link always gets a new url_base
// and url, like Java; the undo of a delete restores it with new rows.
export const saveDmsEdit = async (original, draft, ctx) => {
  const { jwt, journal } = ctx;
  const { flurstueckId } = original;
  const insert = async (object) => {
    const id = await insertDmsUrl(
      { fk_flurstueck: flurstueckId, ...object },
      jwt
    );
    journal.record(`Neues Dokument ${object.name}`, () =>
      deleteDmsUrl(id, jwt)
    );
  };

  const newD3 = draft.d3.filter((row) => !row.dmsId);
  const urlBase = newD3.length ? await d3UrlBase(jwt) : undefined;
  for (const row of newD3) {
    await insert({
      typ: D3_TYP,
      name: text(row.name),
      beschreibung: "D3 Link",
      url: { object_name: row.d3Id.trim(), url_base: urlBase },
    });
  }

  for (const row of draft.dokumente.filter((row) => !row.dmsId)) {
    const { object_name, ...parts } = splitLink(row.link);
    await insert({
      typ: LINK_TYP,
      name: text(row.name),
      beschreibung: text(row.beschreibung),
      url: { object_name, url_base: parts },
    });
  }

  const kept = new Set(
    [...draft.d3, ...draft.dokumente].map((row) => row.dmsId)
  );
  const removed = [...original.d3, ...original.dokumente].filter(
    (row) => !kept.has(row.dmsId)
  );
  for (const row of removed) {
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
