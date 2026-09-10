const DROP_URL_TYPES = [
  "URL",
  "text/uri-list",
  "text/plain",
  "text/html",
] as const;

const parseHttpUrl = (candidate: string): string | null => {
  try {
    const url = new URL(candidate.trim());
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
};

const resolveHtmlUrl = (html: string): string | null => {
  const href = new DOMParser()
    .parseFromString(html, "text/html")
    .querySelector<HTMLAnchorElement>("a[href]")?.href;

  return href ? parseHttpUrl(href) : null;
};

export const resolveDroppedUrl = (
  dataTransfer: Pick<DataTransfer, "getData"> | null | undefined
): string | null => {
  if (!dataTransfer) return null;

  for (const type of DROP_URL_TYPES) {
    let value = "";
    try {
      value = dataTransfer.getData(type);
    } catch {
      continue;
    }

    for (const line of value.split(/\r?\n/)) {
      const candidate = line.trim();
      if (!candidate || candidate.startsWith("#")) continue;
      const url = parseHttpUrl(candidate);
      if (url) return url;
    }

    if (type === "text/html") {
      const url = resolveHtmlUrl(value);
      if (url) return url;
    }
  }

  return null;
};

export const isJsonUrl = (url: string): boolean =>
  new URL(url).pathname.toLowerCase().endsWith(".json");

export const replaceVectorTileServerPlaceholders = (
  input: string,
  vectorTileServerUrl: string
): string =>
  input
    .replaceAll("__SERVER_URL__", vectorTileServerUrl)
    .replaceAll("__server_url__", vectorTileServerUrl);
