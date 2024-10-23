import Color from 'color';
import createElement from 'svg-create-element';
import createSVGPie from 'create-svg-pie';
import L from 'leaflet';
import ColorHash from 'color-hash';
import { veranstaltungsorteColors } from '../constants/colors';

export const getColorForProperties = (properties) => {
  let { mainlocationtype } = properties;

  //console.log(colorHash.hex("" + JSON.stringify({ll})));
  return getColorFromMainlocationTypeName(mainlocationtype?.name);
};

export const getHeaderTextForProperties = (properties) => {
  let mltName = properties?.mainlocationtype?.name;
  let colorCandidate;
  let lookup = getLookup();
  colorCandidate = lookup[mltName];
  if (colorCandidate) {
    return mltName;
  } else {
    return lookup.default + ' (' + mltName + ')';
  }
};

const textConversionDictionary = [
  { from: 'Milongas', to: 'Milongas (Tango Argentino)' },
  { from: 'Veranstaltungsorte', to: 'Sonstige Veranstaltungsorte' },
  { from: 'veranstaltungen', to: 'Veranstaltungsarten' },
  { from: 'einrichtungen', to: 'Einrichtungskategorien' },
];

export const getAllEinrichtungen = () => {
  let lookup = getLookup();
  let einrichtungen: any = [];
  Object.entries(lookup).forEach((entry) => {
    if (entry[0] !== 'default') {
      einrichtungen.push(entry[0]);
    }
  });
  return einrichtungen;
};

export const textConversion = (input, direction = 'FORWARD') => {
  if (direction === 'FORWARD') {
    for (let rule of textConversionDictionary) {
      if (rule.from === input) {
        return rule.to;
      }
    }
  } else {
    for (let rule of textConversionDictionary) {
      if (rule.to === input) {
        return rule.from;
      }
    }
  }
  return input;
};

export const getColorFromMainlocationTypeName = (mltName) => {
  let colorCandidate;
  let lookup = getLookup();

  colorCandidate = lookup[mltName];

  if (colorCandidate) {
    return colorCandidate;
  }
  if (lookup.default && lookup[lookup.default]) {
    colorCandidate = lookup[lookup.default];
    if (colorCandidate) {
      return colorCandidate;
    }
  }

  // Dieser Fall tritt nur ein wenn die ColorRule falsch definiert ist, d.h. wenn ein lookup[lookup.default] nichts zurückliefert
  let colorHash = new ColorHash({ saturation: 0.3 });
  const c = colorHash.hex(mltName);
  console.debug(
    "Keine vordefinierte Farbe für '" +
      mltName +
      "' vorhanden. (Ersatz wird automatisch erstellt) --> " +
      c
  );
  return c;

  //return "#A83F6A";
};

export const classifyMainlocationTypeName = (mltName) => {
  let lookup = getLookup();

  if (lookup[mltName] !== undefined) {
    return mltName;
  } else {
    return lookup.default;
  }
};

const getLookup = () => {
  let lookup: any = null;
  try {
    let qColorRules = null;
    if (qColorRules) {
      try {
        lookup = JSON.parse(qColorRules);
      } catch (error) {
        console.error(error);
      }
    }
  } catch (error) {
    //problem dduring colorRules override
  }
  if (lookup === null) {
    lookup = veranstaltungsorteColors;
  }
  return lookup;
};

export const getFeatureStyler = (
  svgSize = 24,
  colorizer = getColorForProperties
) => {
  return (feature) => {
    var color = Color(getColorForProperties(feature.properties));
    let radius = svgSize / 2; //needed for the Tooltip Positioning
    let canvasSize = svgSize;
    if (feature.selected) {
      canvasSize = svgSize + 12;
    }

    let selectionBox = canvasSize - 6;
    let badge = feature.properties.svgBadge; //|| `<image x="${(svgSize - 20) / 2}" y="${(svgSize - 20) / 2}" width="20" height="20" xlink:href="/pois/signaturen/`+getSignatur(feature.properties)+`" />`;

    let svg = `<svg id="badgefor_${
      feature.id
    }" height="${canvasSize}" width="${canvasSize}"> 
                      <style>
                      /* <![CDATA[ */
                          #badgefor_${feature.id} .bg-fill  {
                              fill: ${getColorForProperties(
                                feature.properties
                              )};
                          }
                          #badgefor_${feature.id} .bg-stroke  {
                              stroke: ${getColorForProperties(
                                feature.properties
                              )};
                          }
                          #badgefor_${feature.id} .fg-fill  {
                              fill: white;
                          }
                          #badgefor_${feature.id} .fg-stroke  {
                              stroke: white;
                          }
                      /* ]]> */
                      </style>
                  <svg x="${svgSize / 12}" y="${svgSize / 12}"  width="${
      svgSize - (2 * svgSize) / 12
    }" height="${svgSize - (2 * svgSize) / 12}" viewBox="0 0 ${
      feature.properties.svgBadgeDimension?.width
    } ${feature.properties.svgBadgeDimension?.height}">       
                      ${badge}
                  </svg>
                  </svg>  `;

    if (feature.selected) {
      let selectionOffset = (canvasSize - selectionBox) / 2;

      let badgeDimension = svgSize - (2 * svgSize) / 12;
      let innerBadgeOffset = (selectionBox - badgeDimension) / 2;

      svg =
        `<svg id="badgefor_${
          feature.id
        }" height="${canvasSize}" width="${canvasSize}">
                      <style>
                      /* <![CDATA[ */
                          #badgefor_${feature.id} .bg-fill  {
                              fill: ${getColorForProperties(
                                feature.properties
                              )};
                          }
                          #badgefor_${feature.id} .bg-stroke  {
                              stroke: ${getColorForProperties(
                                feature.properties
                              )};
                          }
                          #badgefor_${feature.id} .fg-fill  {
                              fill: white;
                          }
                          #badgefor_${feature.id} .fg-stroke  {
                              stroke: white;
                          }
                      /* ]]> */
                      </style>
                  <rect x="${selectionOffset}" y="${selectionOffset}" rx="8" ry="8" width="${selectionBox}" height="${selectionBox}" fill="rgba(67, 149, 254, 0.8)" stroke-width="0"/>
                  <svg x="${selectionOffset + innerBadgeOffset}" y="${
          selectionOffset + innerBadgeOffset
        }" width="${badgeDimension}" height="${badgeDimension}" viewBox="0 0 ` +
        feature.properties.svgBadgeDimension?.width +
        ` ` +
        feature.properties.svgBadgeDimension?.height +
        `">
                  ${badge}
  
                  </svg>
                  </svg>`;
    }

    const style = {
      radius,
      fillColor: color,
      color: color.darken(0.5),
      opacity: 1,
      fillOpacity: 0.8,
      svg,
      svgSize: canvasSize,
    };
    return style;
  };
};
export const getPoiClusterIconCreatorFunction = (
  svgSize = 24,
  colorizer = getColorForProperties
) => {
  //return a function because the functionCall of the iconCreateFunction cannot be manipulated
  return (cluster) => {
    var childCount = cluster.getChildCount();
    const values: any = [];
    const colors: any = [];

    const r = svgSize / 1.5;
    // Pie with default colors
    let childMarkers = cluster.getAllChildMarkers();

    let containsSelection = false;
    let inCart = false;
    for (let marker of childMarkers) {
      values.push(1);
      colors.push(Color(colorizer(marker.feature.properties)));
      if (marker.feature.selected === true) {
        containsSelection = true;
      }
      if (marker.feature.inCart) {
        inCart = true;
      }
    }
    const pie = createSVGPie(values, r, colors);

    let canvasSize = (svgSize / 3.0) * 5.0;
    let background = createElement('svg', {
      width: canvasSize,
      height: canvasSize,
      viewBox: `0 0 ${canvasSize} ${canvasSize}`,
    });

    //Kleiner Kreis in der Mitte
    // (blau wenn selektion)
    let innerCircleColor = '#ffffff';
    if (containsSelection) {
      innerCircleColor = 'rgb(67, 149, 254)';
    }

    //inner circle
    pie.appendChild(
      createElement('circle', {
        cx: r,
        cy: r,
        r: svgSize / 3.0,
        'stroke-width': 0,
        opacity: '0.5',
        fill: innerCircleColor,
      })
    );

    // //Debug Rectangle -should be commnented out
    // background.appendChild(createElement('rect', {
    //     x:0,
    //     y:0,
    //     width: canvasSize,
    //     height: canvasSize,
    //     "stroke-width":1,
    //     stroke: "#000000",
    //     opacity: "1",
    //     fill: "#ff0000"

    // }));

    background.appendChild(pie);

    // Umrandung
    background.appendChild(
      createElement('circle', {
        cx: canvasSize / 2.0,
        cy: canvasSize / 2.0,
        r: r,
        'stroke-width': 2,
        stroke: '#000000',
        opacity: '0.5',
        fill: 'none',
      })
    );

    if (inCart) {
      background
        .appendChild(
          createElement('text', {
            x: '50%',
            y: '50%',
            'text-anchor': 'middle',
            'font-family': 'FontAwesome',
            fill: '#fff',
            'font-size': '26',
            dy: '.4em',
            opacity: '0.5',
          })
        )
        .appendChild(document.createTextNode('\uf005'));
    }

    background
      .appendChild(
        createElement('text', {
          x: '50%',
          y: '50%',
          'text-anchor': 'middle',
          dy: '.3em',
        })
      )
      .appendChild(document.createTextNode(childCount));

    pie.setAttribute('x', (canvasSize - r * 2) / 2.0);
    pie.setAttribute('y', (canvasSize - r * 2) / 2.0);

    var divIcon = L.divIcon({
      className: 'leaflet-data-marker',
      html:
        background.outerHTML ||
        new XMLSerializer().serializeToString(background), //IE11 Compatibility
      iconAnchor: [canvasSize / 2.0, canvasSize / 2.0],
      iconSize: [canvasSize, canvasSize],
    });
    //console.log(background.outerHtml)
    return divIcon;
  };
};
