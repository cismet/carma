import type { Layer3 } from "wms-capabilities";

// Extended Layer interface that includes MetadataURL
interface ExtendedLayer extends Layer3 {
  MetadataURL?: Array<{
    Format?: string;
    OnlineResource?: string;
    size?: number[];
    type?: string;
  }>;
}

export const parseDescription = (description: string) => {
  const result = { inhalt: "", sichtbarkeit: "", nutzung: "" };
  const keywords = ["Inhalt:", "Sichtbarkeit:", "Nutzung:"];

  if (!description) {
    return result;
  }

  function extractTextAfterKeyword(input: string, keyword: string) {
    const index = input.indexOf(keyword);
    if (index !== -1) {
      const startIndex = index + keyword.length;
      let endIndex = input.length;
      for (const nextKeyword of keywords) {
        const nextIndex = input.indexOf(nextKeyword, startIndex);
        if (nextIndex !== -1 && nextIndex < endIndex) {
          endIndex = nextIndex;
        }
      }
      return input.slice(startIndex, endIndex).trim();
    }
    return "";
  }

  result.inhalt = extractTextAfterKeyword(description, "Inhalt:");
  result.sichtbarkeit = extractTextAfterKeyword(description, "Sichtbarkeit:");
  result.nutzung = extractTextAfterKeyword(description, "Nutzung:");

  return result;
};

const parser = new DOMParser();

const getIdFromUrl = (url: string) => {
  const urlObj = new URL(url);

  return urlObj.searchParams.get("id");
};

export const extractInformation = async (layer: ExtendedLayer) => {
  const result = parseDescription(layer.Abstract);
  const metadataUrl = layer.MetadataURL && layer.MetadataURL[0]?.OnlineResource;
  let metadata = {
    text: "",
    url: "",
  };
  if (metadataUrl) {
    const urlWithoutWhitespace = metadataUrl.replaceAll(" ", "");
    try {
      const response = await fetch(urlWithoutWhitespace);
      const text = await response.text();
      const xml = parser.parseFromString(text, "text/xml");
      const abstract = xml.getElementsByTagName("gmd:abstract")[0];
      if (abstract && abstract.textContent) {
        metadata.text = abstract.textContent;
        metadata.url = `https://geoportal-nrw-content-type-pdf-proxy.cismet.de/geoportal-smartfinder-iso-1.2/resources/content/document/${getIdFromUrl(
          urlWithoutWhitespace
        )}?filename=Metadatensatz.${layer.Name.replaceAll(
          " ",
          "_"
        )}.Wuppertal.pdf`;
      }
    } catch (e) {
      // handle error, e.g. log or ignore
    }
  }
  let legend = "";
  layer.Style.forEach((style) => {
    if (style.LegendURL) {
      legend = style.LegendURL[0].OnlineResource;
      return;
    }
  });
  return { ...result, legend, metadata };
};
