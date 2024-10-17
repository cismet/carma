import { useState, useEffect, useRef, ChangeEvent } from "react";
import { debounce } from "lodash";
import {
    Cartesian3,
    Cartographic,
} from "cesium";

import { useTweakpaneCtx } from "@carma-commons/debug";

import { useCesiumContext } from "../../CesiumContextProvider";
import { getPositionWithHeightAsync } from '../../utils/positions';
import "./elevation-control.css";

const getNewPosition = (posCarto: Cartographic, newHeight: number): Cartesian3 => {
    return Cartesian3.fromRadians(
        posCarto.longitude,
        posCarto.latitude,
        newHeight,
    );
}


interface ElevationControlProps {
    displayHeight: number;
    show: boolean;
    useClampedHeight: boolean;
    updateEvent: "cameraChanged" | "scenePreRender" | "scenePreUpdate",
    initialMaxElevation: number;
    localMinEllipsoidalHeight: 100,
}

type DisplayY = {
    factor: number;
    camera: {
        min: number;
        height: number | null;
        relativeToTerrain: number;
        relativeToClamped: number;
    }
    terrain: number | null;
    clamped: number | null;
};


const defaultOptions: ElevationControlProps = {
    displayHeight: 600,
    show: false,
    useClampedHeight: false,
    initialMaxElevation: 500,
    updateEvent: "cameraChanged",
    localMinEllipsoidalHeight: 100,
};

// TOD0: highlight/signify non-reachable min height
// TODO: evaluate change input to differential control like slider that controls speed of movement by distance from center/neutral position

function ElevationControl(options: Partial<ElevationControlProps> = {}) {

    const {
        displayHeight,
        initialMaxElevation,
        localMinEllipsoidalHeight,
        show,
        updateEvent,
        useClampedHeight,
    } = { ...defaultOptions, ...options };

    const [ellipsoidHeight, setEllipsoidHeight] = useState<number>(localMinEllipsoidalHeight);
    const [terrainHeight, setTerrainHeight] = useState<number>(0);
    const [clampedHeight, setClampedHeight] = useState<number>(0);
    const [clampedRelHeightFmt, setClampedRelHeightFmt] = useState<string>("-");
    const [cameraHeight, setCameraHeight] = useState<number>(0);
    const [cameraRelHeightFmt, setCameraRelHeightFmt] = useState<string>("-");
    const [cameraRelClampedHeightFmt, setCameraRelClampedHeightFmt] = useState<string>("-");
    const [cameraHeightFmt, setCameraHeightFmt] = useState<string>("-");
    const [terrainHeightFmt, setTerrainHeightFmt] = useState<string>("-");

    const [maxDisplayHeight, setMaxDisplayHeight] = useState<number>(10000); // Adjust as needed
    const controlRef = useRef<HTMLDivElement>(null);
    const { viewer } = useCesiumContext();
    const [alwaysShow, setAlwaysShow] = useState(false);
    const [clamp, setClamp] = useState(useClampedHeight);
    const [eventOption, setEventOption] = useState(updateEvent);
    const isUpdating = useRef(false);
    const updateHeight = useRef<() => void>();
    const [displayY, setDisplayY] = useState<DisplayY>({
        factor: 1,
        camera: {
            min: 0,
            height: null,
            relativeToTerrain: 0,
            relativeToClamped: 0,
        },
        terrain: null,
        clamped: null,
    });


    useTweakpaneCtx({ title: "Elevation UI" }, {
        get alwaysShow() {
            return alwaysShow;
        },
        set alwaysShow(value: boolean) {
            setAlwaysShow(value);
        },
        get clamp() {
            return clamp;
        },
        set clamp(value: boolean) {
            setClamp(value);
        },
        get eventOption() {
            return eventOption;
        },
        set eventOption(value: "cameraChanged" | "scenePreRender" | "scenePreUpdate") {
            setEventOption(value);
        }
    }, [
        {
            name: "alwaysShow",
            label: "Always Show",
            type: "boolean",
        },
        {
            name: "clamp",
            label: "Clamp Tileset Height",
            type: "boolean",
        },
        {
            name: "eventOption",
            label: "Update Event",
            type: "select",
            options: {
                cameraChanged: "cameraChanged",
                scenePreRender: "scenePreRender",
                scenePreUpdate: "scenePreUpdate",
            },
        },
    ]);


    useEffect(() => {
        if (viewer && (alwaysShow || show)) {
            const update = () => {
                if (isUpdating.current) return;
                isUpdating.current = true; const cameraPositionCartographic = viewer.camera.positionCartographic;
                const currentCameraHeight = cameraPositionCartographic.height;
                setCameraHeightFmt(`${cameraPositionCartographic.height.toFixed(0)}m`);
                getPositionWithHeightAsync(viewer.scene, cameraPositionCartographic, false).then((position) => {
                    setTerrainHeight(position.height);
                    setCameraRelHeightFmt(`${(currentCameraHeight - position.height).toFixed(0)}m`);
                    setTerrainHeightFmt(`${position.height.toFixed(0)}m`);
                    setCameraHeight(currentCameraHeight);
                    setEllipsoidHeight(localMinEllipsoidalHeight);

                    // Update maxDisplayHeight based on current heights
                    const maxHeight = Math.max(
                        currentCameraHeight,
                        position.height,
                        initialMaxElevation,
                    );
                    setMaxDisplayHeight(Math.min(maxHeight * 1.1, 50000));

                    if (clamp) {
                        getPositionWithHeightAsync(viewer.scene, cameraPositionCartographic, true).then((clampedPosition) => {
                            setClampedHeight(clampedPosition.height);
                            setCameraRelClampedHeightFmt(`${(currentCameraHeight - clampedPosition.height).toFixed(0)}m`);
                            setClampedRelHeightFmt(`${(clampedPosition.height - position.height).toFixed(1)}m`);
                            isUpdating.current = false;
                        });
                    } else {
                        isUpdating.current = false;
                    }
                });
            };


            // todo provide these heights and position somewhere centralized state, 
            // don't recompute for every new use in update loop
            const debouncedUpdate = debounce(update, 1000 / 60);
            debouncedUpdate();
            updateHeight.current = update;

            viewer.camera.changed.removeEventListener(debouncedUpdate);
            viewer.scene.preRender.removeEventListener(debouncedUpdate);
            viewer.scene.preUpdate.removeEventListener(debouncedUpdate);

            switch (eventOption) {
                case "cameraChanged":
                    viewer.camera.percentageChanged = 0.01;
                    viewer.camera.changed.addEventListener(debouncedUpdate);
                    break;
                case "scenePreRender":
                    viewer.scene.preRender.addEventListener(debouncedUpdate);
                    break;
                case "scenePreUpdate":
                    viewer.scene.preUpdate.addEventListener(debouncedUpdate);
                    break;
                default:
                    break;
            }
            return () => {
                switch (eventOption) {
                    case "cameraChanged":
                        viewer.camera.changed.removeEventListener(debouncedUpdate);
                        break;
                    case "scenePreRender":
                        viewer.scene.preRender.removeEventListener(debouncedUpdate);
                        break;
                    case "scenePreUpdate":
                        viewer.scene.preUpdate.removeEventListener(debouncedUpdate);
                        break;
                    default:
                        break;
                }
            };
        }
    }, [viewer, alwaysShow, show, clamp, eventOption, localMinEllipsoidalHeight, initialMaxElevation]);


    useEffect(() => {
        if (viewer) {
            const factor = displayHeight / maxDisplayHeight;
            const clampedHeightDisplayPosition =
                (clampedHeight - ellipsoidHeight) * factor;
            const terrainHeightDisplayPosition = (terrainHeight - ellipsoidHeight) * factor;
            const cameraHeightDisplayPosition = (cameraHeight - ellipsoidHeight) * factor;
            const cameraRelHeightDisplayPosition = (terrainHeightDisplayPosition + cameraHeightDisplayPosition) / 2;
            const cameraRelClampedHeightDisplayPosition = clamp ? (clampedHeightDisplayPosition + cameraHeightDisplayPosition) / 2 : cameraRelHeightDisplayPosition;
            const cameraMinElevationDisplayPosition =
                (viewer?.scene.screenSpaceCameraController.minimumZoomDistance ?? 0) * factor + (clamp ? clampedHeightDisplayPosition : terrainHeightDisplayPosition);

            setDisplayY({
                factor,
                camera: {
                    min: Math.round(cameraMinElevationDisplayPosition),
                    height: Math.round(cameraHeightDisplayPosition),
                    relativeToTerrain: Math.round(cameraRelHeightDisplayPosition),
                    relativeToClamped: Math.round(cameraRelClampedHeightDisplayPosition),
                },
                terrain: Math.round(terrainHeightDisplayPosition),
                clamped: Math.round(clampedHeightDisplayPosition),
            });
        }
    }, [
        viewer,
        terrainHeight,
        clampedHeight,
        cameraHeight,
        ellipsoidHeight,
        clamp,
        displayHeight,
        maxDisplayHeight,
    ]);


    console.info("RENDER: [CESIUM] ElevationControl", alwaysShow, show);

    const onChangeHandler = (e: ChangeEvent<HTMLInputElement>) => {
        e.preventDefault();
        const newValue = e.target.valueAsNumber;
        if (
            viewer && Math.abs(cameraHeight - newValue) > 0.05 &&
            (!viewer.scene.screenSpaceCameraController.enableCollisionDetection || newValue >= (terrainHeight + viewer.scene.screenSpaceCameraController.minimumZoomDistance * 0.5))) {

            window.requestAnimationFrame(() => {
                const newPosition = getNewPosition(viewer.camera.positionCartographic, newValue);
                viewer.camera.setView({
                    destination: newPosition,
                    orientation: {
                        heading: viewer.camera.heading,
                        pitch: viewer.camera.pitch,
                        roll: viewer.camera.roll,
                    },
                });
                //viewer.scene.requestRender();
                updateHeight.current && updateHeight.current();
            });
        }
    };

    return ((alwaysShow || show)) && (

        <div // Backdrop
            ref={controlRef}
            style={{
                position: "absolute",
                right: "15px",
                top: "50%",
                transform: "translateY(-50%)",
                width: "100px",
                height: `${displayHeight}px`,
                border: "1px solid black",
                backgroundColor: "rgba(255,255,255,0.8)",
                zIndex: 10,
                padding: "0",
                boxSizing: "border-box",
                pointerEvents: "none",
            }}
        >
            <caption style={{
                position: "relative",
                marginTop: "-1.75rem",
                padding: "0.25rem",
                lineHeight: "1rem",
                float: "right",
                textWrap: "nowrap",
                color: "black",
                backgroundColor: "rgba(255,255,255,0.8)",
            }}>
                Höhe der Kamera
            </caption>
            {viewer?.scene.screenSpaceCameraController.enableCollisionDetection && <div
                style={{
                    position: "absolute",
                    bottom: `${displayY.camera.min}px`,
                    left: "0px",
                    right: "0px",
                    height: "0px",
                    borderBottomWidth: "1px",
                    borderBottomStyle: "dotted",
                    borderBottomColor: "orange",
                    transition: "bottom 0.1s",

                }}
                title={`Minimale Kamera Höhe`}
            />}

            {/* Axis */}
            <div
                style={{
                    position: "absolute",
                    left: "50%",
                    top: "0",
                    bottom: "0",
                    width: "1px",
                    backgroundColor: "black",
                    opacity: "0.5",
                    transform: "translateX(-50%)",
                }}
            />
            {/* Camera Height input */}
            <input
                type="range"
                min={Math.floor(ellipsoidHeight)}
                max={Math.floor(maxDisplayHeight)}
                value={cameraHeight}
                onChange={onChangeHandler}
                step={0.2}
                style={{
                    pointerEvents: "auto",
                    height: "100%",
                    writingMode: "vertical-lr",
                    direction: "rtl",
                    verticalAlign: "middle",
                    cursor: "ns-resize",
                }}
                title={`Kamera Höhe`}
            ></input>
            <label style={{
                position: "absolute",
                bottom: `${displayY.camera.height}px`,
                fontVariantNumeric: "tabular-nums",
                left: "0.5rem",
                height: "1.5rem",
                overflow: "visible",
                textWrap: "nowrap",
                transition: "bottom 0.1s",
            }} >{cameraHeightFmt}</label>
            {/* Surface marker */}
            {clamp && displayY.clamped && displayY.terrain && <div
                style={{
                    position: "absolute",
                    bottom: `${displayY.terrain}px`,
                    left: "50%",
                    right: "0",
                    height: `${displayY.clamped - displayY.terrain}px`,
                    backgroundColor: "fuchsia",
                    opacity: 0.4,
                    transform: "translateX(0%)",
                    transition: "bottom 0.1s, height 0.1s",
                }}
                title={`Normalisierte Gelände Höhe`}
            />}
            {/* Terrain marker */}
            <div
                style={{
                    position: "absolute",
                    bottom: "0",
                    left: "0",
                    right: "0",
                    height: `${displayY.terrain}px`,
                    backgroundColor: "grey",
                    opacity: 0.8,
                    transform: "translateX(0%)",
                    transition: "height 0.1s",

                }}
                title={`Terrain Höhe`}
            />
            <div style={{
                position: "absolute",
                bottom: `${displayY.camera.relativeToTerrain}px`,
                fontVariantNumeric: "tabular-nums",
                left: "0",
                right: "0",
                textAlign: "center",
                overflow: "visible",
                textWrap: "nowrap",
                transform: "translate(-25%,50%) rotate(-90deg)",
                transition: "bottom 0.1s",
            }} >←{cameraRelHeightFmt}→</div>
            {clamp && <div style={{
                position: "absolute",
                bottom: `${displayY.camera.relativeToClamped}px`,
                fontVariantNumeric: "tabular-nums",
                left: "0",
                right: "0",
                textAlign: "center",
                overflow: "visible",
                textWrap: "nowrap",
                transform: "translate(25%,50%) rotate(-90deg)",
                transition: "bottom 0.1s",
            }} >←{cameraRelClampedHeightFmt}→</div>}
            {/* Terrain Label */}
            {displayY.terrain && <div style={{
                position: "absolute",
                bottom: `${displayY.terrain - 20}px`,
                color: "black",
                fontVariantNumeric: "tabular-nums",
                left: "0.25rem",
                height: "1.5rem",
                transition: "bottom 0.1s",
            }} >{terrainHeightFmt}</div>}
            {clamp && <div style={{
                position: "absolute",
                bottom: `${displayY.terrain}px`,
                color: "black",
                fontVariantNumeric: "tabular-nums",
                right: "0.25rem",
                height: "1.5rem",
                transition: "bottom 0.1s",
            }} >{clampedRelHeightFmt}</div>}
            <div style={{
                position: "absolute",
                bottom: "0",
                fontVariantNumeric: "tabular-nums",
                left: "0.25rem",
                height: "1.5rem",
                overflow: "visible",
                textWrap: "nowrap",
                pointerEvents: "auto",
                userSelect: "none",
            }} >{ellipsoidHeight}m <abbr title="Höhe über Ellipsoid">H.ü.E.</abbr></div>

            {/* Cam marker */}
            <div
                style={{
                    position: "absolute",
                    bottom: `${displayY.camera.height}px`,
                    left: "0px",
                    right: "0px",
                    borderBottomWidth: "2px",
                    borderBottomStyle: "solid",
                    borderBottomColor: "#666",
                    transition: "bottom 0.1s",
                }}
                title={`Kamera Höhe`}
            />
        </div>
    );
}

export default ElevationControl;
