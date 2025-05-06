// Helper functions for layer meta info and help blocks

export function layerMetaToMarkdown(layerName, info) {
  return `
### ${layerName}

**Inhalt:**  
${info.inhalt || ""}

**Nutzung:**  
${info.nutzung || ""}

**Legende:**  
${info.legend ? `<img src=\"${info.legend}\" alt=\"Legende für ${layerName}\" style=\"max-width:300px;display:block;margin:8px 0;\" />` : ""}

**Datenquelle:**  
${info.metadata?.text || ""}

${info.metadata?.url
      ? `[Vollständiger Metadatensatz (PDF)](${info.metadata.url})`
      : ""
    }

${info.links && info.links.length > 0
      ? "**Links:**\n" + info.links.map((link) => `- [${link}](${link})`).join("\n")
      : ""
    }
  `.trim();
}

/**
 * Create a help block object for a layer's meta info.
 * @param {string} name - The layer's display name.
 * @param {string} layerName - The technical or display name for the markdown.
 * @param {object} info - The layer meta info object.
 * @returns {object} The help block object.
 */
export function createMetaHelpBlock(name, layerName, info) {
  const content = layerMetaToMarkdown(layerName, info);
  return {
    title: `Layerinformation ${name}`,
    bsStyle: "default",
    contentBlockConf: {
      type: "MARKDOWN",
      content
    }
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
      `... no config found at ${server + path + slugName + "/" + configType + ".json"
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
    console.debug("config: loaded " + slugName + "/" + configType);
    return resultObject;
  } catch (ex) {
    console.debug(
      "no markdown found at ",
      server + path + slugName + "/" + configType + ".md"
    );
  }
}
