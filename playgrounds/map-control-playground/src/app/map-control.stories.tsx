import type { Meta, StoryObj } from "@storybook/react";
import { useEffect, useContext, useState, useRef, CSSProperties } from "react";
import { MappingConstants } from "react-cismap";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import GazetteerSearchComponent from "react-cismap/GazetteerSearchComponent";
import convertItemToFeature from "./helper/convertItemToFeature";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import "bootstrap/dist/css/bootstrap.min.css";
import "leaflet/dist/leaflet.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "react-cismap/topicMaps.css";
import "./App.css";
import Map from "./SimpleMap";
import {
  getFeatureStyler,
  getPoiClusterIconCreatorFunction,
} from "./helper/styler";
import "./index.css";
import "leaflet.locatecontrol/dist/L.Control.Locate.css";
import L from "leaflet";
import LocateControl from "leaflet.locatecontrol";
import {
  ControlLayout,
  Control,
  Main,
  ControlButtonStyler,
  ControlCenterStyler,
} from "@carma-mapping/map-controls-layout";
import {
  AimOutlined,
  HomeOutlined,
  LoadingOutlined,
  SettingFilled,
  SyncOutlined,
  ShrinkOutlined,
  MenuOutlined,
  PlusOutlined,
  MinusOutlined,
} from "@ant-design/icons";
import GoogleMapIframe from "./components/GoogleMapIframe";
import DemoExcalidraw from "./components/DemoExcalidraw";
import InfoBox from "react-cismap/topicmaps/InfoBox";
import GenericInfoBoxFromFeature from "react-cismap/topicmaps/GenericInfoBoxFromFeature";
import { Divider } from "antd";

if (typeof global === "undefined") {
  window.global = window;
}

const meta: Meta<typeof Map> = {
  component: Map,
  title: "MapControl",
};
export default meta;
type Story = StoryObj<typeof Map>;

const MapWithProviders = () => {
  return (
    <TopicMapContextProvider
      appKey="OnlineBaederkarteWuppertal2022"
      featureItemsURL={
        "https://wupp-topicmaps-data.cismet.de/data/baeder.data.json"
      }
      referenceSystemDefinition={MappingConstants.proj4crs25832def}
      mapEPSGCode="25832"
      referenceSystem={MappingConstants.crs25832}
      getFeatureStyler={getFeatureStyler}
      featureTooltipFunction={(feature) => feature?.text}
      convertItemToFeature={convertItemToFeature}
      clusteringOptions={{
        iconCreateFunction: getPoiClusterIconCreatorFunction({ svgSize: 24 }),
      }}
    >
      <Map />
    </TopicMapContextProvider>
  );
};

const iconPadding = {
  backgroundColor: "#fff",
  border: "2px solid rgba(0, 0, 0, .23)",
  borderRadius: "4px",
  width: "34px",
  height: "34px",
  textAlign: "center",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "18px",
};

const LocateControlComponent = ({ startLocate = 0 }) => {
  const { routedMapRef } = useContext<typeof TopicMapContext>(
    TopicMapContext,
  ) as any;
  const [locationInstance, setLocationInstance] =
    useState<LocateControl | null>(null);

  useEffect(() => {
    if (!locationInstance && routedMapRef) {
      const mapExample = routedMapRef.leafletMap.leafletElement;
      const lc = (L.control as LocateControl)
        .locate({
          position: "topright",
          strings: {
            title: "demo location",
          },
          flyTo: true,
          drawMarker: false,
          icon: "custom_icon",
        })
        .addTo(mapExample);
      setLocationInstance(lc);
    }

    // return () => {
    //   lc.remove();
    // };
  }, [routedMapRef]);

  useEffect(() => {
    if (startLocate && locationInstance) {
      locationInstance.start();
    }
  }, [startLocate]);

  return null;
};

export const ReplaceLocatorFromLeaflet = () => {
  const [locationProps, setLocationProps] = useState(0);
  const [containerHeight, setContainerHeight] = useState<CSSProperties | null>(
    null,
  );
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef) {
      setContainerHeight({
        width: `100%`,
        height: `${containerRef.current?.clientHeight}px`,
      });
    }
  }, [containerRef]);
  return (
    <TopicMapContextProvider
      appKey="OnlineBaederkarteWuppertal2022"
      featureItemsURL={
        "https://wupp-topicmaps-data.cismet.de/data/baeder.data.json"
      }
      referenceSystemDefinition={MappingConstants.proj4crs25832def}
      mapEPSGCode="25832"
      referenceSystem={MappingConstants.crs25832}
      getFeatureStyler={getFeatureStyler}
      featureTooltipFunction={(feature) => feature?.text}
      convertItemToFeature={convertItemToFeature}
      clusteringOptions={{
        iconCreateFunction: getPoiClusterIconCreatorFunction({
          svgSize: 24,
        }),
      }}
    >
      <ControlLayout>
        <Control position="topleft" order={30}>
          <ControlButtonStyler>
            <AimOutlined onClick={() => setLocationProps((prev) => prev + 1)} />
          </ControlButtonStyler>
          <LocateControlComponent startLocate={locationProps} />
        </Control>
        <Main ref={containerRef}>
          <Map mapStyle={containerHeight ?? undefined} />
        </Main>
      </ControlLayout>
    </TopicMapContextProvider>
  );
};

export const ExcalidrawExample = () => {
  const [locationProps, setLocationProps] = useState(0);
  const [containerHeight, setContainerHeight] = useState<CSSProperties | null>(
    null,
  );
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef) {
      setContainerHeight({
        width: `100%`,
        height: `${containerRef.current?.clientHeight}px`,
      });
    }
  }, [containerRef]);
  return (
    <ControlLayout>
      <Control position="topleft" order={40}>
        <AimOutlined />
      </Control>
      <Control position="topleft" order={30}>
        <SettingFilled />
      </Control>
      <Control position="topleft" order={20}>
        <ShrinkOutlined />
      </Control>
      <Control position="topleft" order={10}>
        <PlusOutlined />
      </Control>
      <Control position="topright" order={1}>
        <SyncOutlined />
      </Control>
      <Control position="topright" order={40}>
        <AimOutlined />
      </Control>
      <Control position="topright" order={30}>
        <SettingFilled />
      </Control>
      <Control position="bottomright" order={20}>
        <ShrinkOutlined />
      </Control>
      <Control position="bottomright" order={10}>
        <PlusOutlined />
      </Control>
      <Control position="bottomright" order={1}>
        <HomeOutlined />
      </Control>
      <Control position="bottomleft" order={80}>
        <HomeOutlined />
      </Control>
      <Control position="bottomleft" order={1}>
        <LoadingOutlined />
      </Control>
      <Control position="bottomleft" order={2}>
        <LoadingOutlined />
      </Control>
      <Control position="bottomleft" order={1}>
        <SyncOutlined />
      </Control>
      <Main ref={containerRef}>
        <DemoExcalidraw />
      </Main>
    </ControlLayout>
  );
};

export const ResponsiveControlWithTwoColumns = () => {
  const [containerWidth, setContainerWidth] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef) {
      setContainerWidth(containerRef.current?.clientWidth ?? null);
    }
  }, [containerRef]);

  return (
    <ControlLayout>
      <Control position="bottomleft" order={1}>
        <div style={{ width: "600px", background: "red" }}>
          A search component
        </div>
      </Control>
      <Control position="bottomright" order={1}>
        <div
          style={{
            width: "400px",
            background: containerWidth ? "yellow" : "blue",
          }}
        >
          Info banner
        </div>
      </Control>
      <Main ref={containerRef}>
        <GoogleMapIframe />
      </Main>
    </ControlLayout>
  );
};

export const ResponsiveCollapsWithTwoColumnsOnBottom = () => {
  const [containerWidth, setContainerWidth] = useState<CSSProperties | null>(
    null,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const [layoutHeight, setLayoutHeight] = useState<unknown | null>(null);
  useEffect(() => {
    if (containerRef) {
      setContainerWidth({
        width: `100%`,
        height: `${containerRef.current?.clientHeight}px`,
      });
    }
  }, [containerRef, layoutHeight]);
  return (
    <TopicMapContextProvider
      appKey="OnlineBaederkarteWuppertal2022"
      featureItemsURL={
        "https://wupp-topicmaps-data.cismet.de/data/baeder.data.json"
      }
      referenceSystemDefinition={MappingConstants.proj4crs25832def}
      mapEPSGCode="25832"
      referenceSystem={MappingConstants.crs25832}
      getFeatureStyler={getFeatureStyler}
      featureTooltipFunction={(feature) => feature?.text}
      convertItemToFeature={convertItemToFeature}
      clusteringOptions={{
        iconCreateFunction: getPoiClusterIconCreatorFunction({
          svgSize: 24,
        }),
      }}
    >
      <ControlLayout
        onResponsiveCollapse={(collapseEvent) => {
          console.log("xxx", collapseEvent);
        }}
        onHeightResize={setLayoutHeight}
      >
        <Control position="topleft" order={40}>
          <ControlButtonStyler>
            <AimOutlined />
          </ControlButtonStyler>
        </Control>
        <Control position="topleft" order={30}>
          <ControlButtonStyler>
            <SettingFilled />
          </ControlButtonStyler>
        </Control>
        <Control position="topleft" order={20}>
          <ControlButtonStyler>
            <ShrinkOutlined />
          </ControlButtonStyler>
        </Control>
        <Control position="topright" order={30}>
          <ControlButtonStyler>
            <MenuOutlined />
          </ControlButtonStyler>
        </Control>
        <Control position="bottomleft" order={1} fullCollapseWidth={true}>
          <GazetteerSearchComponent />
        </Control>
        <Control position="bottomright" order={1} fullCollapseWidth={true}>
          <div
            style={{
              width: "300px",
              background: "white",
              height: "80px",
              padding: "4px",
              fontSize: "12px",
              opacity: "0.9",
            }}
          >
            Info Box
          </div>
        </Control>

        <Main ref={containerRef}>
          <Map mapStyle={containerWidth ?? undefined} />
        </Main>
      </ControlLayout>
    </TopicMapContextProvider>
  );
};

export const ResponsiveThreeColumnsOnTop = () => {
  const [containerWidth, setContainerWidth] = useState<CSSProperties | null>(
    null,
  );
  const [resonsiveCollapse, setResonsiveCollapse] = useState<unknown | null>(
    null,
  );
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef) {
      setContainerWidth({
        width: `100%`,
        height: `${containerRef.current?.clientHeight}px`,
      });
    }
  }, [containerRef]);

  return (
    <TopicMapContextProvider
      appKey="OnlineBaederkarteWuppertal2022"
      featureItemsURL={
        "https://wupp-topicmaps-data.cismet.de/data/baeder.data.json"
      }
      referenceSystemDefinition={MappingConstants.proj4crs25832def}
      mapEPSGCode="25832"
      referenceSystem={MappingConstants.crs25832}
      getFeatureStyler={getFeatureStyler}
      featureTooltipFunction={(feature) => feature?.text}
      convertItemToFeature={convertItemToFeature}
      clusteringOptions={{
        iconCreateFunction: getPoiClusterIconCreatorFunction({
          svgSize: 24,
        }),
      }}
    >
      <ControlLayout
        onResponsiveCollapse={(collapseEvent) => {
          setResonsiveCollapse(collapseEvent);
        }}
      >
        <Control position="topleft" order={40}>
          <ControlButtonStyler>
            <AimOutlined />
          </ControlButtonStyler>
        </Control>
        <Control position="topleft" order={30}>
          <ControlButtonStyler>
            <SettingFilled />
          </ControlButtonStyler>
        </Control>
        <Control position="topleft" order={20}>
          <ControlButtonStyler>
            <ShrinkOutlined />
          </ControlButtonStyler>
        </Control>
        <Control position="topright" order={30}>
          <ControlButtonStyler>
            <MenuOutlined />
          </ControlButtonStyler>
        </Control>
        <Control position="topcenter" order={30}>
          <ControlCenterStyler>
            <div>Center controller</div>
          </ControlCenterStyler>
        </Control>
        <Main ref={containerRef}>
          <Map mapStyle={containerWidth ?? undefined} />
        </Main>
      </ControlLayout>
    </TopicMapContextProvider>
  );
};

export const ResponsiveAllPosition = () => {
  const [containerWidth, setContainerWidth] = useState<CSSProperties | null>(
    null,
  );
  const [resonsiveCollapse, setResonsiveCollapse] = useState<unknown | null>(
    null,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const [layoutHeight, setLayoutHeight] = useState<number | null>(null);
  useEffect(() => {
    if (containerRef) {
      setContainerWidth({
        width: `100%`,
        height: `${containerRef.current?.clientHeight}px`,
      });
    }
  }, [containerRef, layoutHeight]);

  return (
    <TopicMapContextProvider
      appKey="OnlineBaederkarteWuppertal2022"
      featureItemsURL={
        "https://wupp-topicmaps-data.cismet.de/data/baeder.data.json"
      }
      referenceSystemDefinition={MappingConstants.proj4crs25832def}
      mapEPSGCode="25832"
      referenceSystem={MappingConstants.crs25832}
      getFeatureStyler={getFeatureStyler}
      featureTooltipFunction={(feature) => feature?.text}
      convertItemToFeature={convertItemToFeature}
      clusteringOptions={{
        iconCreateFunction: getPoiClusterIconCreatorFunction({
          svgSize: 24,
        }),
      }}
    >
      <ControlLayout
        onResponsiveCollapse={(collapseEvent) => {
          setResonsiveCollapse(collapseEvent);
        }}
        onHeightResize={setLayoutHeight}
      >
        <Control position="topleft" order={10}>
          <ControlButtonStyler height="63px" fontSize="14px">
            <PlusOutlined />
            <Divider
              style={{
                marginTop: "0px",
                marginBottom: "0px",
              }}
            />
            <MinusOutlined />
          </ControlButtonStyler>
        </Control>
        <Control position="topleft" order={30}>
          <ControlButtonStyler>
            <SettingFilled />
          </ControlButtonStyler>
        </Control>
        <Control position="topleft" order={20}>
          <ControlButtonStyler>
            <ShrinkOutlined />
          </ControlButtonStyler>
        </Control>
        <Control position="topright" order={30}>
          <ControlButtonStyler>
            <MenuOutlined />
          </ControlButtonStyler>
        </Control>
        <Control position="topcenter" order={30}>
          <div
            style={
              {
                ...iconPadding,
                fontSize: "14px",
                opacity: 0.9,
                width: "100%",
                maxWidth: "100%",
                height: "100%",
                padding: "5px 4px",
                border: "none",
                borderRadius: "0px",
              } as CSSProperties
            }
          >
            <div>Center controller</div>
          </div>
        </Control>
        <Control position="bottomleft" order={10} fullCollapseWidth={true}>
          <GazetteerSearchComponent />
        </Control>
        <Control position="bottomright" order={10} fullCollapseWidth={true}>
          <div
            style={{
              width: "300px",
              background: "white",
              height: "80px",
              padding: "4px",
              fontSize: "12px",
              opacity: "0.9",
            }}
          >
            Info Box
          </div>
        </Control>
        <Main ref={containerRef}>
          <Map mapStyle={containerWidth ?? undefined} />
        </Main>
      </ControlLayout>
    </TopicMapContextProvider>
  );
};

export const ResponsiveDebugMode = () => {
  const [containerWidth, setContainerWidth] = useState<CSSProperties | null>(
    null,
  );
  const [resonsiveCollapse, setResonsiveCollapse] = useState<unknown | null>(
    null,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const [layoutHeight, setLayoutHeight] = useState<number | null>(null);

  useEffect(() => {
    if (containerRef) {
      setContainerWidth({
        width: `100%`,
        height: `${containerRef.current?.clientHeight}px`,
      });
    }
  }, [containerRef, layoutHeight]);

  return (
    <TopicMapContextProvider
      appKey="OnlineBaederkarteWuppertal2022"
      featureItemsURL={
        "https://wupp-topicmaps-data.cismet.de/data/baeder.data.json"
      }
      referenceSystemDefinition={MappingConstants.proj4crs25832def}
      mapEPSGCode="25832"
      referenceSystem={MappingConstants.crs25832}
      getFeatureStyler={getFeatureStyler}
      featureTooltipFunction={(feature) => feature?.text}
      convertItemToFeature={convertItemToFeature}
      clusteringOptions={{
        iconCreateFunction: getPoiClusterIconCreatorFunction({
          svgSize: 24,
        }),
      }}
    >
      <ControlLayout
        onResponsiveCollapse={(collapseEvent) => {
          setResonsiveCollapse(collapseEvent);
        }}
        debugMode={true}
        onHeightResize={setLayoutHeight}
      >
        <Control position="topleft" order={40}>
          <ControlButtonStyler>
            <AimOutlined />
          </ControlButtonStyler>
        </Control>
        <Control position="topleft" order={30}>
          <ControlButtonStyler>
            <SettingFilled />
          </ControlButtonStyler>
        </Control>
        <Control position="topleft" order={20}>
          <ControlButtonStyler>
            <ShrinkOutlined />
          </ControlButtonStyler>
        </Control>
        <Control position="topright" order={30}>
          <ControlButtonStyler>
            <MenuOutlined />
          </ControlButtonStyler>
        </Control>
        <Control position="topcenter" order={30}>
          <div
            style={
              {
                ...iconPadding,
                fontSize: "14px",
                opacity: 0.9,
                width: "100%",
                maxWidth: "100%",
                height: "100%",
                padding: "5px 4px",
                border: "none",
              } as CSSProperties
            }
          >
            <div>Center controller</div>
          </div>
        </Control>
        <Control position="bottomleft" order={1} fullCollapseWidth={true}>
          <GazetteerSearchComponent />
        </Control>
        <Control position="bottomright" order={10} fullCollapseWidth={true}>
          <div
            style={{
              width: "300px",
              background: "white",
              height: "80px",
              padding: "4px",
              fontSize: "12px",
              opacity: "0.9",
            }}
          >
            Info Box
          </div>
        </Control>
        <Control position="bottomright" order={20}>
          <div
            style={{
              width: "120px",
              background: "green",
              height: "80px",
              padding: "4px",
              fontSize: "12px",
              opacity: "0.9",
            }}
          >
            Pic Box
          </div>
        </Control>
        <Main ref={containerRef}>
          <Map mapStyle={containerWidth ?? undefined} />
        </Main>
      </ControlLayout>
    </TopicMapContextProvider>
  );
};

export const CalculateResponsiveBrake = () => {
  const [containerWidth, setContainerWidth] = useState<CSSProperties | null>(
    null,
  );
  const [resonsiveCollapse, setResonsiveCollapse] = useState<unknown | null>(
    null,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const [layoutHeight, setLayoutHeight] = useState<number | null>(null);

  useEffect(() => {
    if (containerRef) {
      setContainerWidth({
        width: `100%`,
        height: `${containerRef.current?.clientHeight}px`,
      });
    }
  }, [containerRef, layoutHeight]);

  return (
    <TopicMapContextProvider
      appKey="OnlineBaederkarteWuppertal2022"
      featureItemsURL={
        "https://wupp-topicmaps-data.cismet.de/data/baeder.data.json"
      }
      referenceSystemDefinition={MappingConstants.proj4crs25832def}
      mapEPSGCode="25832"
      referenceSystem={MappingConstants.crs25832}
      getFeatureStyler={getFeatureStyler}
      featureTooltipFunction={(feature) => feature?.text}
      convertItemToFeature={convertItemToFeature}
      clusteringOptions={{
        iconCreateFunction: getPoiClusterIconCreatorFunction({
          svgSize: 24,
        }),
      }}
    >
      <ControlLayout
        onResponsiveCollapse={(collapseEvent) => {
          setResonsiveCollapse(collapseEvent);
        }}
        onHeightResize={setLayoutHeight}
      >
        <Control
          position="bottomright"
          order={10}
          fullCollapseWidth={true}
          bottomRightWidth={500}
        >
          <div
            style={{
              width: "500px",
              background: "white",
              height: "80px",
              padding: "4px",
              fontSize: "12px",
              opacity: "0.9",
            }}
          >
            Info Box
          </div>
        </Control>
        <Control position="bottomright" order={20}>
          <div
            style={{
              width: "120px",
              background: "green",
              height: "80px",
              padding: "4px",
              fontSize: "12px",
              opacity: "0.9",
            }}
          >
            Pic Box
          </div>
        </Control>
        <Control
          position="bottomleft"
          order={10}
          bottomLeftWidth={500}
          fullCollapseWidth={true}
        >
          <GazetteerSearchComponent pixelwidth={500} />
        </Control>
        <Control position="bottomleft" order={20} bottomLeftWidth={300}>
          <div
            style={{
              width: "300px",
              background: "white",
              height: "80px",
              padding: "4px",
              fontSize: "12px",
              opacity: "0.9",
            }}
          >
            Second Gazetter
          </div>
        </Control>
        <Main ref={containerRef}>
          <Map mapStyle={containerWidth ?? undefined} />
        </Main>
      </ControlLayout>
    </TopicMapContextProvider>
  );
};
