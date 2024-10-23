import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faDotCircle,
  faArrowUp,
  faBullseye,
} from "@fortawesome/free-solid-svg-icons";
import proj4 from "proj4";
import { vccPasswd } from "../../constants/verdis";
import { useSelector } from "react-redux";
import { getVirtualCity } from "../../store/slices/search";

function getBoundingBoxForLeafletMap(leafletMap) {
  const bounds = leafletMap.leafletElement.getBounds();
  const projectedNE = proj4(proj4.defs("EPSG:4326"), proj4.defs("EPSG:25832"), [
    bounds._northEast.lng,
    bounds._northEast.lat,
  ]);
  const projectedSW = proj4(proj4.defs("EPSG:4326"), proj4.defs("EPSG:25832"), [
    bounds._southWest.lng,
    bounds._southWest.lat,
  ]);
  return {
    left: projectedSW[0],
    top: projectedNE[1],
    right: projectedNE[0],
    bottom: projectedSW[1],
  };
}

const Overlay = ({ mapWidth, mapHeight, mapRef }) => {
  let mapBBox, mapCenter;

  if (mapRef?.current?.leafletMap?.leafletElement) {
    mapBBox = getBoundingBoxForLeafletMap(mapRef?.current?.leafletMap);
    //calculate the center from the bbox
    mapCenter = {
      x: (mapBBox.left + mapBBox.right) / 2,
      y: (mapBBox.top + mapBBox.bottom) / 2,
    };

    //console.log("mapRef", mapRef?.current?.leafletMap);

    const overlayWidth = mapWidth / 3;
    const overlayHeight = mapHeight / 3;
    const overlayTop = (mapHeight - overlayHeight) / 2;
    const overlayLeft = (mapWidth - overlayWidth) / 2;

    const USER = "wuppertal";
    const PASSWORD = useSelector(getVirtualCity);

    const HEADINGS = [180, 270, 0, 90];

    const groundPosX = mapCenter.x;
    const groundPosY = mapCenter.y;
    const groundPosZ = 0;
    const distance = (mapBBox.top - mapBBox.bottom) / 2;

    const camPosX = groundPosX;
    const camPosY = groundPosY;
    const camPosZ = groundPosZ + distance;
    const epsg = "25832";
    const centerIcon = (
      <FontAwesomeIcon icon={faBullseye} style={{ fontSize: 40 }} />
    );

    return (
      <div className="w-full h-full flex items-center justify-center">
        <div
          style={{
            zIndex: 100000,
            _pointerEvents: "none",
          }}
          className="bg-black/40 text-gray-300 relative aspect-video w-60 md:w-[300px] lg:w-[450px] xl:w-[550px]"
        >
          <div className="w-full absolute bottom-0 text-center lg:text-lg xl:text-xl md:text-base text-sm">
            3D- und Schrägluftbildviewer öffnen
          </div>
          {/* Center Icon */}
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              opacity: 0.5,
            }}
          >
            {centerIcon}
          </div>

          {/* Corner Icons */}

          {[
            { y: "top", x: "left" },
            { y: "top", x: "right" },
            { y: "bottom", x: "right" },
            { y: "bottom", x: "left" },
          ].map((position, index) => {
            // Calculate angle based on the corner position
            const angle = Math.atan2(
              position.y === "top" ? -150 : 150,
              position.x === "left" ? -260 : 260
            );
            const rotate = angle * (180 / Math.PI) + 90; // Convert to degrees and adjust the initial rotation

            return (
              <div
                key={index}
                style={{
                  [position.y]: 0,
                  [position.x]: 0,
                  opacity: 0.7,
                }}
                className="absolute"
              >
                <a
                  href={`https://${USER}:${PASSWORD}@wuppertal.virtualcitymap.de/?startingmap=Oblique%20Map&lang=de&groundPosition=${groundPosX},${groundPosY},0&formerZPosition=${groundPosZ}&distance=${distance}&pitch=-90.00&heading=${HEADINGS[index]}&roll=0.00&cameraPosition=${camPosX},${camPosY},${camPosZ}&epsg=${epsg}`}
                  target="_vcm"
                >
                  <FontAwesomeIcon
                    icon={faArrowUp}
                    className="text-primary/90 text-lg md:text-4xl lg:text-6xl xl:text-8xl"
                    style={{
                      margin: 10,
                      transform: `rotate(${rotate + 180}deg)`,
                    }}
                  />
                </a>
              </div>
            );
          })}
        </div>
      </div>
    );
  } else {
    return null;
  }
};

export default Overlay;
