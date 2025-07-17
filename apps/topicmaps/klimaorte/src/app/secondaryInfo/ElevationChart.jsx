import React, { useContext, useRef } from "react";
import { Chart as ChartJS, registerables } from "chart.js";
import { Chart } from "react-chartjs-2";
import zoomPlugin from "chartjs-plugin-zoom";

import SecondaryInfoPanelSection from "./SecondaryInfoPanelSection";
import { faMagnifyingGlassMinus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { FeatureCollectionContext } from "react-cismap/contexts/FeatureCollectionContextProvider";
// import { getSymbolSVGGetter } from "react-cismap/tools/uiHelper";

ChartJS.register(...registerables, zoomPlugin);

export default function ElevationChart({ revertedOrder }) {
  const { selectedFeature } = useContext(FeatureCollectionContext);
  const item = selectedFeature?.properties;
  const geomlength = item.geomlength;

  const elevationData = {};
  let i = 0;
  for (const station of item.stations || []) {
    elevationData[Math.round(station)] = { z: item.zvals[i++] };
  }

  // add routepoints
  for (const rp of item.routenpunkte || []) {
    //check if station is already in elevationData
    if (elevationData[Math.round(rp.station)]) {
      elevationData[Math.round(rp.station)].routepoint = rp;
    } else {
      elevationData[Math.round(rp.station)] = { routepoint: rp };
    }
  }

  // attention: the elevationData is not sorted by station

  const chartRef = useRef(null);
  //const [zoom, setZoom] = React.useState(1);
  // const sampleSvg = allFeatures[0].properties.svgBadge;
  // const sampleSvgDimensions = allFeatures[0].properties.svgBadgeDimension;
  let maxElevation = 0;
  const stations = [];
  const elevations = [];
  const combinedData = [];

  for (const station of Object.keys(elevationData)) {
    stations.push(station);
  }

  stations.sort((a, b) => a - b);
  i = 0;
  for (const station of stations) {
    if (elevationData[station].z) {
      elevations.push(elevationData[station].z);
    } else {
      elevations.push(null);
    }
  }
  for (const elevation of elevations) {
    if (elevation === null) {
      let lower = 0;
      let upper = elevations.slice(-1); //last elevation in array
      if (i > 0 && i < elevations.length) {
        lower = elevations[i - 1];
        upper = elevations[i + 1];
      } else if (i === 0) {
        upper = elevations[i + 1];
      } else if (i === elevations.length) {
        lower = elevations[i - 1];
      }
      const fakeElevation = (lower + upper) / 2;
      elevations[i] = fakeElevation;
    }
    i++;
    maxElevation = Math.max(maxElevation, elevation);
  }
  i = 0;
  for (const station of stations) {
    if (elevationData[station].routepoint) {
      combinedData.push({
        station: Math.round(station),
        station_reverted: Math.round(geomlength - station),
        routepoint: elevationData[station].routepoint,
        z: elevations[i],
      });
    } else {
      combinedData.push({
        station: Math.round(station),
        station_reverted: Math.round(geomlength - station),
        z: elevations[i],
      });
    }
    i++;
  }
  const labels = stations;

  let combinedDataInTheRightOrder = combinedData;
  if (revertedOrder) {
    combinedDataInTheRightOrder = combinedData.slice().reverse();
  }
  const options = {
    animation: false,
    onHover: function (e, item) {
      // add hover here!!!
    },
    responsive: true,
    interaction: {
      intersect: false,
      mode: "nearest",
    },

    tooltip: {
      position: "nearest",
    },
    plugins: {
      title: {
        align: "end",
        display: false,
        text: "Distanz, m / Höhe, m",
      },
      legend: {
        display: false,
      },
      tooltip: {
        displayColors: false,
        position: "nearest",

        callbacks: {
          title: (tooltipItems) => {
            return "Entfernung: " + tooltipItems[0].label + "m";
          },
          label: (tooltipItem) => {
            // console.log("tooltipitem,", tooltipItem);
            if (tooltipItem.dataset.name === "elevation") {
              return "Höhe: " + tooltipItem.raw + "m";
            } else {
              const rp =
                combinedDataInTheRightOrder[tooltipItem.dataIndex]?.routepoint;
              if (rp) {
                const name = rp.name;
                return [
                  name,
                  "Höhe: " + elevations[tooltipItem.dataIndex] + "m",
                ];
              } else {
                return null;
              }
            }
          },
        },
      },
      zoom: {
        zoom: {
          wheel: {
            enabled: false,
          },
          pinch: {
            enabled: true,
          },
          drag: {
            enabled: true,
          },
          pan: {
            enabled: true,
          },
          mode: "x",
          // onZoom: (e) => {
          //   setZoom(e.chart.getZoomLevel());
          // },
          // onZoomComplete: (e) => {
          //   // setZoom(e.chart.getZoomLevel());
          //   zoomRef.current = e.chart.getZoomLevel();
          // },
        },
      },
    },
    scales: {
      x: {
        type: "linear",
        beginAtZero: true,
        max: Math.round(labels[labels.length - 1]),
      },

      y: {
        type: "linear",
        beginAtZero: true,
      },
    },
  };
  // const svgCode = getSymbolSVGGetter(sampleSvg, sampleSvgDimensions)(
  //   24,
  //   "green",
  //   "angebot_4711"
  // );
  // const blob = new Blob([sampleSvg], { type: "image/svg+xml" });
  // const url = URL.createObjectURL(blob);

  // const img = new Image();
  // // img.src =
  // //   "https://wunda-geoportal.cismet.de/poi-signaturen/Icon_Platz_farbig.svg";
  // img.src = url;

  //calculate the y Value of the routepoints as a round up to the next 50 from maxElevation
  const virtualElevationForRoutePoints = Math.ceil(maxElevation / 50) * 50;

  const data = {
    labels: revertedOrder
      ? combinedDataInTheRightOrder.map((item) => item.station_reverted)
      : combinedDataInTheRightOrder.map((item) => item.station),
    datasets: [
      {
        type: "bubble",
        name: "routePoints",
        fill: false,
        pointRadius: 10,
        pointHoverRadius: 0,
        pointHitRadius: 100,
        // _pointStyle: (context) => {
        //   return img;
        // },
        pointStyle: "rect",
        data: combinedDataInTheRightOrder.map((item) => {
          if (item?.routepoint) {
            return virtualElevationForRoutePoints;
          } else {
            return null;
          }
        }),
        // borderColor: (context) => {
        //   console.log("borderColor context", context);

        //   return "red";
        // },
        // backgroundColor: (context) => "red",
        _borderColor: "rgb(53, 162, 235)",
        _backgroundColor: "rgba(53, 162, 235, 0.5)",
      },
      {
        type: "line",
        name: "elevation",
        fill: true,

        pointHoverRadius: 0,
        pointHitRadius: 0,
        pointRadius: 0,
        data: combinedDataInTheRightOrder.map((item) => item.z),
        borderColor: "rgb(53, 162, 235)",
        backgroundColor: "rgba(53, 162, 235, 0.5)",
      },
    ],
  };

  return (
    <SecondaryInfoPanelSection
      key={"hoehenprofil"}
      header={
        "Höhenprofil" + (revertedOrder ? " (umgekehrte Reihenfolge)" : "")
      }
      bsStyle="success"
      // extra={
      //   <FontAwesomeIcon
      //     style={{ color: "grey" }}
      //     onClick={(e) => {
      //       e.stopPropagation();
      //       e.preventDefault();
      //       console.log("click");
      //       chartRef.current.resetZoom();
      //     }}
      //     icon={faMagnifyingGlassMinus}
      //   ></FontAwesomeIcon>
      // }
    >
      <Chart
        ref={chartRef}
        style={{ maxHeight: 200 }}
        options={options}
        data={data}
      />

      <FontAwesomeIcon
        title="Zoom zurücksetzen"
        style={{
          position: "relative",
          left: 40,
          top: -50,
          color: "#00000099",
          cursor: "pointer",
        }}
        icon={faMagnifyingGlassMinus}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          console.log("click");
          chartRef.current.resetZoom();
        }}
      />
    </SecondaryInfoPanelSection>
  );
}
