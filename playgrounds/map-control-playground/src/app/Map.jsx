import { MinusOutlined, PlusOutlined } from "@ant-design/icons";
import {
  Control,
  ControlButtonStyler,
  ControlLayout,
  Main,
} from "@carma-mapping/map-controls-layout";
import {
  faCompress,
  faExpand,
  faHouseChimney,
  faLocationArrow,
  faMap,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useContext, useEffect, useRef, useState } from "react";
import GazetteerSearchComponent from "react-cismap/GazetteerSearchComponent";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";

const Map = () => {
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(null);
  const [layoutHeight, setLayoutHeight] = useState(null);
  const [mode, setMode] = useState("2D");

  const { routedMapRef } = useContext(TopicMapContext);

  useEffect(() => {
    if (containerRef) {
      setContainerWidth({
        width: `100%`,
        height: `${containerRef.current?.clientHeight}px`,
      });
    }
  }, [containerRef, layoutHeight]);

  return (
    <ControlLayout onHeightResize={setLayoutHeight} ifStorybook={false}>
      <Control position="topleft" order={10}>
        <div className="flex flex-col">
          <ControlButtonStyler
            onClick={() => {
              routedMapRef.leafletMap.leafletElement.zoomIn();
            }}
            className="!border-b-0 !rounded-b-none"
          >
            <PlusOutlined />
          </ControlButtonStyler>
          <ControlButtonStyler
            onClick={() => {
              routedMapRef.leafletMap.leafletElement.zoomOut();
            }}
            className="!rounded-t-none"
          >
            <MinusOutlined />
          </ControlButtonStyler>
        </div>
      </Control>
      <Control position="topleft" order={20}>
        <ControlButtonStyler
          onClick={() => {
            if (document.fullscreenElement) {
              document.exitFullscreen();
            } else {
              document.documentElement.requestFullscreen();
            }
          }}
        >
          <FontAwesomeIcon
            icon={document.fullscreenElement ? faCompress : faExpand}
          />
        </ControlButtonStyler>
      </Control>
      <Control position="topleft" order={30}>
        <ControlButtonStyler>
          <FontAwesomeIcon icon={faLocationArrow} />
        </ControlButtonStyler>
      </Control>
      <Control position="topleft" order={40}>
        <ControlButtonStyler
          onClick={() =>
            routedMapRef.leafletMap.leafletElement.flyTo(
              [51.272570027476256, 7.199918031692506],
              14,
            )
          }
        >
          <FontAwesomeIcon icon={faHouseChimney} />
        </ControlButtonStyler>
      </Control>
      <Control position="topleft" order={50}>
        <ControlButtonStyler>
          <img src="measure.png" alt="Measure" className="w-6" />
        </ControlButtonStyler>
      </Control>
      <Control position="topleft" order={60}>
        <ControlButtonStyler
          onClick={() => {
            setMode(mode === "2D" ? "3D" : "2D");
          }}
        >
          {mode === "2D" ? "3D" : "2D"}
        </ControlButtonStyler>
      </Control>
      <Control position="topcenter">
      <div

        className={
          'w-fit min-w-max flex items-center gap-2 px-3 rounded-[10px] h-8 z-[99999999] button-shadow bg-white'
      }
      >
        <FontAwesomeIcon icon={faMap} />
        </div>
      </Control>
      <Control position="bottomleft" order={10} fullCollapseWidth={true}>
        <GazetteerSearchComponent />
      </Control>
      <Main ref={containerRef}>
        {mode === "2D" ? (
          <TopicMapComponent
            locatorControl={false}
            gazetteerSearchControl={false}
            hamburgerMenu={false}
            zoomControls={false}
            fullScreenControl={false}
            mapStyle={containerWidth}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <p>3D Map kommt hierhin</p>
          </div>
        )}
      </Main>
    </ControlLayout>
  );
};

export default Map;
