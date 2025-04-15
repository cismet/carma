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
