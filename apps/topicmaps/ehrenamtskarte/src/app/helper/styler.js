import Color from "color";
import ColorHash from "color-hash";
import createSVGPie from "create-svg-pie";
import L from "leaflet";
import queryString from "query-string";
import createElement from "svg-create-element";

import { POI_COLORS, constants } from "./constants";

const fallbackSVG = `
    <svg xmlns="http://www.w3.org/2000/svg" width="311.668" height="311.668">
        <path class="bg-fill" fill="#C32D6A"  d="M0-.661h313.631v313.63H0z"/>
        <path class="fg-fill" fill="#FFF"  d="M292.827 156.794c0 18.76-3.584 36.451-10.733 53.095-7.187 16.681-16.929 31.17-29.302 43.523-12.354 12.392-26.88 22.152-43.523 29.302s-34.335 10.733-53.094 10.733c-18.74 0-36.432-3.584-53.104-10.733-16.653-7.149-31.17-16.91-43.533-29.302-12.354-12.354-22.125-26.843-29.273-43.523-7.159-16.644-10.743-34.335-10.743-53.095 0-18.74 3.584-36.432 10.743-53.084 7.149-16.653 16.919-31.17 29.273-43.533 12.363-12.354 26.88-22.144 43.533-29.293 16.671-7.148 34.363-10.742 53.104-10.742 18.759 0 36.45 3.594 53.094 10.742 16.644 7.149 31.17 16.939 43.523 29.293 12.373 12.363 22.115 26.88 29.302 43.533 7.149 16.652 10.733 34.344 10.733 53.084zm-24.612 0c0-15.347-2.936-29.854-8.77-43.523-5.853-13.66-13.859-25.575-24.021-35.746-10.143-10.132-22.058-18.14-35.727-23.983-13.649-5.881-28.177-8.808-43.523-8.808-15.356 0-29.855 2.926-43.543 8.808-13.66 5.843-25.556 13.851-35.708 23.983-10.152 10.171-18.159 22.086-24.021 35.746-5.853 13.669-8.789 28.177-8.789 43.523 0 15.385 2.936 29.874 8.789 43.524 5.862 13.669 13.869 25.584 24.021 35.745 10.152 10.142 22.048 18.149 35.708 24.002 13.688 5.872 28.187 8.788 43.543 8.788 15.347 0 29.874-2.916 43.523-8.788 13.669-5.853 25.584-13.86 35.727-24.002 10.161-10.161 18.168-22.076 24.021-35.745 5.834-13.65 8.77-28.139 8.77-43.524zm-32.79 0c0 10.943-2.078 21.237-6.234 30.865-4.155 9.608-9.855 17.997-17.005 25.184-7.149 7.149-15.537 12.812-25.146 16.968-9.628 4.156-19.923 6.253-30.865 6.253-10.943 0-21.219-2.097-30.846-6.253s-18.035-9.818-25.184-16.968c-7.158-7.187-12.811-15.575-16.977-25.184-4.166-9.628-6.244-19.922-6.244-30.865 0-10.924 2.078-21.18 6.244-30.846 4.166-9.627 9.818-18.016 16.977-25.165 7.149-7.178 15.557-12.83 25.184-16.996s19.903-6.263 30.846-6.263c10.942 0 21.237 2.097 30.865 6.263 9.608 4.166 17.996 9.818 25.146 16.996 7.149 7.149 12.85 15.538 17.005 25.165 4.156 9.666 6.234 19.922 6.234 30.846z"/>
    </svg>
`;

export const getColorForProperties = (feature) => {
  let colorHash = new ColorHash({ saturation: 0.3 });
  let { kenntnisse, globalbereiche, zielgruppen } = feature.properties;
  return colorHash.hex(
    "" + JSON.stringify({ kenntnisse, globalbereiche, zielgruppen })
  );
};

export const ehrenAmtClusterIconCreator = (cluster) => {
  var childCount = cluster.getChildCount();

  const values = [];
  const colors = [];
  const r = 16;

  // Pie with default colors
  let childMarkers = cluster.getAllChildMarkers();

  let containsSelection = false;
  let inCart = false;
  for (let marker of childMarkers) {
    values.push(1);
    colors.push(Color(getColorForProperties(marker.feature)));
    if (marker.feature.selected === true) {
      containsSelection = true;
    }
    if (marker.feature.inCart) {
      inCart = true;
    }
  }
  const pie = createSVGPie(values, r, colors);

  let background = createElement("svg", {
    width: 40,
    height: 40,
    viewBox: "0 0 40 40",
  });

  //Kleiner Kreis in der Mitte
  // (blau wenn selektion)
  let innerCircleColor = "#ffffff";
  if (containsSelection) {
    innerCircleColor = "rgb(67, 149, 254)";
  }
  pie.appendChild(
    createElement("circle", {
      cx: r,
      cy: r,
      r: 8,
      "stroke-width": 0,
      opacity: "0.5",
      fill: innerCircleColor,
    })
  );

  background.appendChild(pie);

  background.appendChild(
    createElement("circle", {
      cx: 20,
      cy: 20,
      r: r,
      "stroke-width": 2,
      stroke: "#000000",
      opacity: "0.5",
      fill: "none",
    })
  );

  if (inCart) {
    background
      .appendChild(
        createElement("text", {
          x: "50%",
          y: "50%",
          "text-anchor": "middle",
          "font-family": "FontAwesome",
          fill: "#fff",
          "font-size": "26",
          dy: ".4em",
          opacity: "0.5",
        })
      )
      .appendChild(document.createTextNode("\uf005"));
  }

  background
    .appendChild(
      createElement("text", {
        x: "50%",
        y: "50%",
        "text-anchor": "middle",
        dy: ".3em",
      })
    )
    .appendChild(document.createTextNode(childCount));

  pie.setAttribute("x", 4);
  pie.setAttribute("y", 4);

  var divIcon = L.divIcon({
    className: "leaflet-data-marker",
    html:
      background.outerHTML || new XMLSerializer().serializeToString(background), //IE11 Compatibility
    iconAnchor: [20, 20],
    iconSize: [40, 40],
  });
  //console.log(background.outerHtml)
  return divIcon;
};

export const getFeatureStyler = (
  svgSize = 24,
  colorizer = getColorForProperties,
  appMode,
  secondarySelection,
  additionalStylingInfo
) => {
  const poiColors = additionalStylingInfo?.poiColors || POI_COLORS;

  return (feature) => {
    let color = Color(getColorForProperties(feature));
    let radius = 8; //needed for the Tooltip Positioning
    let selectionBox = 30;
    let weight = 2;
    let canvasSize = svgSize;
    if (feature.selected) {
      canvasSize = svgSize + 12;
    }

    let badge = feature.properties.svgBadge || fallbackSVG; //|| `<image x="${(svgSize - 20) / 2}" y="${(svgSize - 20) / 2}" width="20" height="20" xlink:href="/pois/signaturen/`+getSignatur(feature.properties)+`" />`;

    let svg = `<svg id="badgefor_${
      feature.id
    }" height="${canvasSize}" width="${canvasSize}"> 
                    <style>
                    /* <![CDATA[ */
                        #badgefor_${feature.id} .bg-fill  {
                            fill: ${colorizer(feature)};
                        }
                        #badgefor_${feature.id} .bg-stroke  {
                            stroke: ${colorizer(feature)};
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
    }" height="${svgSize - (2 * svgSize) / 12}" viewBox="0 0 40 40">       
    <circle cx="${svgSize / 2}" cy="${
      svgSize / 2
    }" r="${radius}" stroke="${color}" stroke-width="${weight}" fill="${color}" />
                </svg>
            
                `;

    if (feature.selected) {
      let selectionOffset = (svgSize - selectionBox) / 2;

      let badgeDimension = svgSize - (2 * svgSize) / 12;
      let innerBadgeOffset = (selectionBox - badgeDimension) / 2;

      svg = `<svg id="badgefor_${
        feature.id
      }" height="${canvasSize}" width="${canvasSize}">
                    <style>
                    /* <![CDATA[ */
                        #badgefor_${feature.id} .bg-fill  {
                            fill: ${colorizer(feature.properties, poiColors)};
                        }
                        #badgefor_${feature.id} .bg-stroke  {
                            stroke: ${colorizer(feature.properties, poiColors)};
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
                <circle cx="${svgSize / 2}" cy="${
        svgSize / 2
      }" r="${radius}" stroke="${color}" stroke-width="${weight}" fill="${color}" />
               `;
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
