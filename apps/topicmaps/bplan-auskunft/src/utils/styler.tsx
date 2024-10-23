export const bplanFeatureStyler = (feature) => {
  // return (feature) => {
  const style = {
    color: getColorFromFeatureConsideringSelection(feature),
    weight: 3,
    opacity: 1.0,
    //    "dashArray": "30",
    fillColor: getColorFromFeature(feature),
    fillOpacity: getFeatureOpacityConsideringSelection(feature),
  };
  return style;
  // };
};

export const getColorFromFeature = (feature) => {
  let color = '#ff0000';
  switch (feature?.properties?.status) {
    case 'rechtskräftig':
      color = '#2AFF00'; //40';
      break;
    case 'nicht rechtskräftig':
      color = '#FC0000'; //40';
      break;
    default:
      //beides
      color = '#2AFF00'; //40';
  }
  return color;
};

export const getLineColorFromFeature = (feature) => {
  let color = '#ff0000';
  switch (feature?.properties?.status) {
    case 'rechtskräftig':
      color = '#2AFF00';
      break;
    case 'nicht rechtskräftig':
      color = '#FC0000';
      break;
    default:
      //beides
      color = '#FC0000';
  }
  return color;
};

export const getColorFromFeatureConsideringSelection = (feature) => {
  if (feature.selected) {
    return '#4395FE';
  } else {
    return getColorFromFeature(feature);
  }
};
export const getLineColorFromFeatureConsideringSelection = (feature) => {
  if (feature.selected) {
    return '#4395FE';
  } else {
    return getLineColorFromFeature(feature);
  }
};

export const getShadowColorFromFeatureConsideringSelection = (feature) => {
  if (feature.selected) {
    return '#4395FE';
  } else {
    return '#000000';
  }
};

export const getTooltipStyleFromFeatureConsideringSelection = (feature) => {
  let base = {
    color: getLineColorFromFeature(feature),
    textShadow:
      '1px 1px 0px  #000000,-1px 1px 0px  #000000, 1px -1px 0px  #000000, -1px -1px 0px  #000000, 2px 2px 15px #000000',
  };
  if (feature.selected) {
    const radius = 10;
    const borderDef = `${radius}px ${radius}px ${radius}px ${radius}px`;
    return {
      ...base,
      background: 'rgba(67, 149, 254, 0.8)',
      WebkitBorderRadius: borderDef,
      MozBorderRadius: borderDef,
      borderRadius: borderDef,
      padding: '5px',
    };
  } else {
    return base;
  }
};

export const getFeatureOpacityConsideringSelection = (feature) => {
  if (feature.selected) {
    return 0.5;
  } else {
    return 0.4;
  }
};

export const bplanLabeler = (feature) => {
  return (
    <h3 style={getTooltipStyleFromFeatureConsideringSelection(feature)}>
      {feature.properties.nummer}
    </h3>
  );
};

//not used atm. is neede if one day the FeatureCollectionDisplayWithTooltipLabels component is ditched
export const getMarkerStyleFromFeatureConsideringSelection = (feature) => {
  let opacity = 0.6;
  let linecolor = '#000000';
  let weight = 1;

  if (feature.selected === true) {
    opacity = 0.9;
    linecolor = '#0C7D9D';
    weight = 2;
  }

  let backgroundLabelColor = 'rgba(67, 149, 254, 0.6)';

  const boxWidth = (100 / 7) * feature.properties.nummer.length + 15;
  const boxX = (160 - boxWidth) / 2;
  let selectionLabelBackground;
  if (feature.selected) {
    selectionLabelBackground = `<rect fill="${backgroundLabelColor}" x="${boxX}" y="30" rx="5" ry="5" width="${boxWidth}" height="40" />`;
  } else {
    selectionLabelBackground = '';
  }
  const style = {
    radius: 10,
    color: linecolor,
    weight: weight,
    opacity: 1.0,
    fillOpacity: opacity,
    svgSize: 100,
    className: 'bplan-flaeche-marker-' + feature.properties.nummer,
    svg: `<svg height="100" width="160">
      <style>
          .bplan_number { 
            font: bold 24px sans-serif; 
            text-shadow: 1px 1px 0px  #000000,-1px 1px 0px  #000000, 1px -1px 0px  #000000, -1px -1px 0px  #000000, 2px 2px 15px #000000;
          }
          .bplan_label_background {

          }
          
      </style>
      ${selectionLabelBackground}
      <text x="80" y="50" class="bplan_number" text-anchor="middle" alignment-baseline="central" fill="${getLineColorFromFeature(
        feature
      )}">${feature.properties.nummer}</text>
    </svg>`,
  };
  return style;
};
