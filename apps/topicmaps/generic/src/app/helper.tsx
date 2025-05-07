import { GTMComponentDictionary } from "@carma-collab/wuppertal/generic-topicmap";

const functionToFeature = (output: any, code: string) => {
  try {
    let codeFunction = eval("(" + code + ")");
    const tmpInfo = codeFunction(output);

    if (!tmpInfo) {
      return undefined;
    }

    const properties = {
      ...tmpInfo,
      wmsProps: output,
    };

    return { properties };
  } catch (error) {
    console.log(error);
    return undefined;
  }
};

const objectToFeature = (jsonOutput: any, code: string) => {
  if (!jsonOutput) {
    return {
      properties: {
        title: "Keine Informationen gefunden",
      },
    };
  }

  const conf = code
    .split("\n")
    .filter((line) => line.trim() !== "" && line.trim() !== "undefined");

  let functionString = `(function(p) {
                      const info = {`;

  conf.forEach((rule) => {
    functionString += `${rule.trim()},\n`;
  });

  functionString += `
                                            };
                                            return info;
                      })`;

  const tmpInfo = eval(functionString)(jsonOutput);

  const properties = {
    ...tmpInfo,
    wmsProps: jsonOutput,
  };

  return { properties };
};

export const createVectorFeature = (mapping, selectedVectorFeature) => {
  let feature: any = undefined;

  let properties = selectedVectorFeature.properties;
  properties = {
    ...properties,
    vectorId: selectedVectorFeature.id,
  };
  let result = "";
  let featureInfoZoom = 20;
  mapping.forEach((keyword) => {
    result += keyword + "\n";
  });

  if (result) {
    if (result.includes("function")) {
      // remove every line that is not a function
      result = result
        .split("\n")
        .filter((line) => line.includes("function"))
        .join("\n");
    }

    const featureProperties = result.includes("function")
      ? functionToFeature(properties, result)
      : objectToFeature(properties, result);
    if (!featureProperties) {
      return undefined;
    }
    const genericLinks = featureProperties.properties.genericLinks || [];

    feature = {
      properties: {
        ...featureProperties.properties,
        genericLinks: genericLinks,
        zoom: featureInfoZoom,
      },
      geometry: selectedVectorFeature.geometry,
    };
  }
  return feature;
};

/**
 * Generate a markdown info block for a vector layer.
 * @param {string} layerName - The display name of the layer.
 * @param {object} info - The layer information object.
 * @returns {string} Markdown content for the layer.
 */
export function layerMetaToMarkdown(layerName, info) {
  const ret = `

${
  info.legend
    ? `<img src="${info.legend}" alt="Legende für ${layerName}" style="padding-left:10px;padding-right:10px;float:right;padding-bottom:5px;max-width:250px;" />`
    : ""
}

**Inhalt:**  
${info.inhalt || ""}

**Nutzung:**  
${info.nutzung || ""}

**Datenquelle:**  
${info.metadata?.text || ""}

${
  info.metadata?.url
    ? `[Vollständiger Metadatensatz (PDF)](${info.metadata.url})`
    : ""
}

${
  info.links && info.links.length > 0
    ? "**Links:**\n" +
      info.links.map((link) => `- [${link.label}](${link.link})`).join("\n")
    : ""
}`.trim();
  return ret;
}

/**
 * Create a help block object for a layer's meta info.
 * @param {string} name - The layer's display name.
 * @param {string} content - The markdown content for the layer.
 * @returns {object} The help block object.
 */
export function createMetaHelpBlock(name, layerName, info) {
  const content = layerMetaToMarkdown(layerName, info);
  return {
    title: `${name}`,
    bsStyle: "primary",
    contentBlockConf: {
      type: "MARKDOWN",
      content,
    },
  };
}

export async function getConfig(slugName, configType, server, path, log) {
  try {
    const u = server + path + slugName + "/" + configType + ".json";
    log(`... try to read config at ${u}`);
    const result = await fetch(u);
    const resultObject = await result.json();
    log(`... config: loaded ${slugName}/${configType}`);
    return resultObject;
  } catch (ex) {
    log(
      `... no config found at ${
        server + path + slugName + "/" + configType + ".json"
      }`
    );
    return undefined;
  }
}
export async function getMarkdown(slugName, configType, server, path) {
  try {
    const u = server + path + slugName + "/" + configType + ".md";
    console.debug("try to read markdown at ", u);
    const result = await fetch(u);
    const resultObject = await result.text();
    console.debug(
      "config: loaded " + slugName + "/" + configType,
      resultObject
    );
    return resultObject;
  } catch (ex) {
    console.debug(
      "no markdown found at ",
      server + path + slugName + "/" + configType + ".md"
    );
  }
}

export function gtmComponentResolver(
  stringToCheck: string,
  componentProps: any
) {
  // normally there is something like {{gtmComponnetDictionary.helpTextDemo}}
  // inside the stringToCheck
  // if not return null

  if (!stringToCheck) {
    return null;
  }
  const regex = /{{(.*?)}}/g;
  const matches = stringToCheck.match(regex);
  if (!matches) {
    return null;
  }
  // Extract the content inside {{...}}
  let extracted = matches[0].replace(/{{|}}/g, "").trim();
  // Only take the part after the last dot (the component name)
  const componentName = extracted.split(".").pop();

  // Check if the component name exists in the dictionary
  if (!componentName) {
    console.error("Component name not found in string.");
    return null;
  }

  const Component = GTMComponentDictionary[componentName];
  if (!Component) {
    console.error(`Component ${componentName} not found in dictionary.`);
    return null;
  }
  return <Component {...componentProps} />;
}

type RenderMarkdownSectionLinksProps = {
  text: string;
  sectionmapping?: Record<string, string>;
  setAppMenuActiveMenuSection: (section: string) => void;
};

export function RenderMarkdownSectionLinks({
  text,
  sectionmapping = {},
  setAppMenuActiveMenuSection,
}: RenderMarkdownSectionLinksProps) {
  // Regex to match **SectionName**
  const regex = /\*\*(.+?)\*\*/g;

  // Split the text into parts, keeping track of matches
  const parts: (string | JSX.Element)[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index);
    if (before) parts.push(before);

    const sectionName = match[1];
    const sectionKey = sectionmapping[sectionName];
    if (sectionKey) {
      parts.push(
        <a
          key={sectionKey + match.index}
          className="renderAsLink"
          onClick={() => setAppMenuActiveMenuSection(sectionKey)}
          style={{ cursor: "pointer" }}
        >
          {sectionName}
        </a>
      );
    } else {
      // If not in mapping, render as <strong>SectionName</strong>
      parts.push(<strong key={"strong-" + match.index}>{sectionName}</strong>);
    }
    lastIndex = regex.lastIndex;
  }
  // Add any remaining text after the last match
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <span>{parts}</span>;
}
