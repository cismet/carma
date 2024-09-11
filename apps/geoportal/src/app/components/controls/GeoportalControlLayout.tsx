import { useContext, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
    Control,
    ControlButtonStyler,
    ControlLayout,
    Main,
} from "@carma-mapping/map-controls-layout";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faCompress,
    faExpand,
    faHouseChimney,
    faInfo,
    faLocationArrow,
    faMinus,
    faPlus,
} from "@fortawesome/free-solid-svg-icons";
import "cesium/Build/Cesium/Widgets/widgets.css";

import {
    MapTypeSwitcher,
    Compass,
    useHomeControl,
    useViewerIsMode2d,
    useZoomControls,
} from "@carma-mapping/cesium-engine";

import { Tooltip } from "antd";
import { useOverlayHelper } from "@carma/libraries/commons/ui/lib-helper-overlay";
import { geoElements } from "@carma-collab/wuppertal/geoportal";
import { getCollabedHelpComponentConfig } from "@carma-collab/wuppertal/helper-overlay";

import {
    setFeatures,
    setPreferredLayerId,
    setSecondaryInfoBoxElements,
    setSelectedFeature,
} from "../../store/slices/features.ts";
import {
    getShowFullscreenButton,
    getShowLocatorButton,
    getShowMeasurementButton,
    setStartDrawing,
} from "../../store/slices/mapping.ts";
import {
    getAllow3d,
    getMode,
    getShowLayerButtons,
    setMode,
} from "../../store/slices/ui.ts";

import LocateControlComponent from "./LocateControlComponent.tsx";
import { LibFuzzySearch } from "@carma-mapping/fuzzy-search";
import LayerWrapper from "../layers/LayerWrapper.tsx";

export const GeoportalControlLayout = ({
    setPos, children, gazData, setWidth, setHeight,
    setLayoutHeight,
    gazetteerHit, setGazetteerHit, setOverlayFeature
}: any) => {
    const dispatch = useDispatch();

    const {
        routedMapRef,
        referenceSystem,
        referenceSystemDefinition,
    } = useContext<typeof TopicMapContext>(TopicMapContext);

    const showFullscreenButton = useSelector(getShowFullscreenButton);
    const showLocatorButton = useSelector(getShowLocatorButton);
    const showMeasurementButton = useSelector(getShowMeasurementButton);
    const showLayerButtons = useSelector(getShowLayerButtons);


    const homeControl = useHomeControl();

    const mode = useSelector(getMode);
    const isMode2d = useViewerIsMode2d();
    const allow3d = useSelector(getAllow3d);

    const { handleZoomIn, handleZoomOut } = useZoomControls();


    const zoomControlTourRef = useOverlayHelper(
        getCollabedHelpComponentConfig("ZOOM", geoElements),
    );
    const fullScreenControlTourRef = useOverlayHelper(
        getCollabedHelpComponentConfig("VOLLBILD", geoElements),
    );
    const navigatorControlTourRef = useOverlayHelper(
        getCollabedHelpComponentConfig("MEINE_POSITION", geoElements),
    );
    const homeControlTourRef = useOverlayHelper(
        getCollabedHelpComponentConfig("RATHAUS", geoElements),
    );
    const measurementControlTourRef = useOverlayHelper(
        getCollabedHelpComponentConfig("MESSUNGEN", geoElements),
    );
    const gazetteerControlTourRef = useOverlayHelper(
        getCollabedHelpComponentConfig("GAZETTEER_SUCHE", geoElements),
    );


    // LOCAL STATES
    const [locationProps, setLocationProps] = useState(0);
    const [isMeasurementTooltip, setIsMeasurementTooltip] = useState(false);
    const urlPrefix = window.location.origin + window.location.pathname;




    const wrapperRef = useRef<HTMLDivElement>(null);


    useEffect(() => {
        const handleResize = () => {
            if (wrapperRef.current) {
                setHeight(wrapperRef.current.clientHeight);
                setWidth(wrapperRef.current.clientWidth);
            }
        };

        window.addEventListener("resize", handleResize);

        handleResize();

        return () => window.removeEventListener("resize", handleResize);
    }, []);

    return (
        <ControlLayout onHeightResize={setLayoutHeight} ifStorybook={false}>
            <Control position="topleft" order={10}>
                <div ref={zoomControlTourRef} className="flex flex-col">
                    <ControlButtonStyler
                        onClick={(e) => {
                            // TODO Check for side effects of this while animating
                            isMode2d && routedMapRef.leafletMap.leafletElement.zoomIn();
                            !isMode2d && handleZoomIn(e);
                        }}
                        className="!border-b-0 !rounded-b-none font-bold !z-[9999999]"
                    >
                        <FontAwesomeIcon icon={faPlus} className="text-base" />
                    </ControlButtonStyler>
                    <ControlButtonStyler
                        onClick={(e) => {
                            isMode2d && routedMapRef.leafletMap.leafletElement.zoomOut();
                            !isMode2d && handleZoomOut(e);
                        }}
                        className="!rounded-t-none !border-t-[1px]"
                    >
                        <FontAwesomeIcon icon={faMinus} className="text-base" />
                    </ControlButtonStyler>
                </div>
            </Control>
            <Control position="topleft" order={20}>
                {showFullscreenButton && (
                    <ControlButtonStyler
                        onClick={() => {
                            if (document.fullscreenElement) {
                                document.exitFullscreen();
                            } else {
                                document.documentElement.requestFullscreen();
                            }
                        }}
                        ref={fullScreenControlTourRef}
                    >
                        <FontAwesomeIcon
                            icon={document.fullscreenElement ? faCompress : faExpand}
                        />
                    </ControlButtonStyler>
                )}
            </Control>
            <Control position="topleft" order={30}>
                {showLocatorButton && (
                    <ControlButtonStyler
                        ref={navigatorControlTourRef}
                        onClick={() => setLocationProps((prev) => prev + 1)}
                    >
                        <FontAwesomeIcon icon={faLocationArrow} className="text-2xl" />
                    </ControlButtonStyler>
                )}
                <LocateControlComponent startLocate={locationProps} />
            </Control>
            <Control position="topleft" order={40}>
                <ControlButtonStyler
                    ref={homeControlTourRef}
                    onClick={() => {
                        routedMapRef.leafletMap.leafletElement.flyTo(
                            [51.272570027476256, 7.199918031692506],
                            18,
                        );
                        homeControl();
                    }}
                >
                    <FontAwesomeIcon icon={faHouseChimney} className="text-lg" />
                </ControlButtonStyler>
            </Control>
            <Control position="topleft" order={50}>
                {showMeasurementButton && (
                    <div className="flex items-center gap-4">
                        <Tooltip
                            title={
                                !isMode2d
                                    ? "zum Messen zu 2D-Modus wechseln"
                                    : "Strecke / Fläche messen"
                            }
                            open={isMeasurementTooltip}
                            defaultOpen={false}
                            onOpenChange={() => {
                                if (mode === "measurement") {
                                    setIsMeasurementTooltip(false);
                                } else {
                                    setIsMeasurementTooltip(!isMeasurementTooltip);
                                }
                            }}
                            placement="right"
                        >
                            <ControlButtonStyler
                                disabled={!isMode2d}
                                onClick={() => {
                                    dispatch(
                                        setMode(mode === "measurement" ? "default" : "measurement"),
                                    );
                                }}
                                ref={measurementControlTourRef}
                            >
                                <img
                                    src={`${urlPrefix}${mode === "measurement"
                                        ? "measure-active.png"
                                        : "measure.png"
                                        }`}
                                    alt="Measure"
                                    className="w-6"
                                />
                            </ControlButtonStyler>
                        </Tooltip>
                        {mode === "measurement" && (
                            <Tooltip title="Neue Messung" placement="right">
                                <ControlButtonStyler
                                    onClick={() => {
                                        dispatch(setStartDrawing(true));
                                    }}
                                >
                                    <FontAwesomeIcon icon={faPlus} />
                                </ControlButtonStyler>
                            </Tooltip>
                        )}
                    </div>
                )}
            </Control>
            {
                allow3d && (
                    <Control position="topleft" order={60}>
                        <MapTypeSwitcher />
                        {
                            //<SceneStyleToggle />
                            <Compass disabled={isMode2d} />
                            // TODO implement cesium home action with generic home control for all mapping engines
                            //<HomeControl />
                        }
                    </Control>
                )
            }
            <Control position="topleft" order={60}>
                <Tooltip title="Sachdatenabfrage" placement="right">
                    <ControlButtonStyler
                        disabled={!isMode2d}
                        onClick={() => {
                            dispatch(
                                setMode(mode === "featureInfo" ? "default" : "featureInfo"),
                            );
                            dispatch(setSelectedFeature(null));
                            dispatch(setSecondaryInfoBoxElements([]));
                            dispatch(setFeatures([]));
                            setPos(null);
                            dispatch(setPreferredLayerId(""));
                        }}
                        className="font-semibold"
                    >
                        <FontAwesomeIcon
                            icon={faInfo}
                            className={mode === "featureInfo" ? "text-[#1677ff]" : ""}
                        />
                    </ControlButtonStyler>
                </Tooltip>
            </Control>
            {showLayerButtons && isMode2d &&
                <Control position="topcenter" order={10}>
                    <LayerWrapper />
                </Control>
            }
            <Control position="bottomleft" order={10}>
                <div ref={gazetteerControlTourRef} className="h-full w-full">
                    <LibFuzzySearch
                        gazData={gazData}
                        mapRef={routedMapRef}
                        referenceSystem={referenceSystem}
                        referenceSystemDefinition={referenceSystemDefinition}
                        gazetteerHit={gazetteerHit}
                        setGazetteerHit={setGazetteerHit}
                        setOverlayFeature={setOverlayFeature}
                        placeholder="Wohin?"
                    />
                </div>
            </Control>
            <Main ref={wrapperRef}
            >
                {children}
            </Main>
        </ControlLayout>)
}

export default GeoportalControlLayout;