import { useEffect, useMemo, useRef, useState } from "react";
import { Select } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCrosshairs,
  faLocationDot,
  faPlane,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";
import * as THREE from "three";

import {
  averageMeshHeightSamplesByControlPoint,
  calculateMeshHeightErrorMetrics,
  calculateMeshHeightResiduals,
  type MeshHeightSample,
} from "./mesh-height-calibration";
import {
  loadNivControlPoints,
  type NivControlPoint,
} from "./niv-control-points";
import { createModelNavigationControls } from "./model-navigation-controls";
import { createMesh2024TilesRuntime } from "./mesh-2024-tiles-runtime";
import {
  createEcefToSceneMatrix,
  ecefEllipsoidalHeight,
  ecefToScenePosition,
  sceneToEcefPosition,
} from "./ecef-scene-frame";

// Exact GCG2016 result from the same offline pipeline as the NIV artifact.
const SCENE_ORIGIN_ELLIPSOIDAL_HEIGHT = 207.598234228;
const SCENE_ORIGIN_LONGITUDE_DEGREES = 7.163461245;
const SCENE_ORIGIN_LATITUDE_DEGREES = 51.241111235;
const ECEF_TO_SCENE = createEcefToSceneMatrix(
  THREE.MathUtils.degToRad(SCENE_ORIGIN_LONGITUDE_DEGREES),
  THREE.MathUtils.degToRad(SCENE_ORIGIN_LATITUDE_DEGREES),
  SCENE_ORIGIN_ELLIPSOIDAL_HEIGHT
);
const SAMPLE_STORAGE_KEY = "carma-mesh-niv-height-samples-v2";
const DEFAULT_ERROR_TARGET_PIXELS = 0.5;

type StoredMeshHeightSample = MeshHeightSample & {
  scenePosition: [number, number, number];
  createdAt: string;
};

type CalibrationRuntime = {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  controls: ReturnType<typeof createModelNavigationControls>;
  sampleGroup: THREE.Group;
  officialMarker: THREE.Object3D;
  requestRender: () => void;
  flyTo: (point: NivControlPoint, close: boolean) => void;
  setErrorTarget: (target: number) => void;
};

const officialEllipsoidalHeight = (point: NivControlPoint) =>
  point.ellipsoidalHeight;

const nivPointToScenePosition = (point: NivControlPoint) =>
  ecefToScenePosition(point.ecef, ECEF_TO_SCENE);

const ellipsoidalToPointDhhN2016Height = (
  point: NivControlPoint,
  ellipsoidalHeight: number
) => ellipsoidalHeight - (point.ellipsoidalHeight - point.hoehe_ueber_nhn2016);

const formatMeters = (value: number | undefined, digits = 3) =>
  value === undefined || !Number.isFinite(value)
    ? "–"
    : `${value.toFixed(digits)} m`;

const formatSignedCentimeters = (value: number | undefined) =>
  value === undefined || !Number.isFinite(value)
    ? "–"
    : `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)} cm`;

const formatCentimeters = (value: number | undefined) =>
  value === undefined || !Number.isFinite(value)
    ? "–"
    : `${(value * 100).toFixed(1)} cm`;

const pointLabel = (point: NivControlPoint) => {
  const number = point.punktnummer_nrw
    ? `${point.laufende_nummer} · ${point.punktnummer_nrw}`
    : point.laufende_nummer;
  return `${number} · ${point.lagebezeichnung}`;
};

const loadStoredSamples = (): StoredMeshHeightSample[] => {
  try {
    const raw = window.localStorage.getItem(SAMPLE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredMeshHeightSample[];
    return parsed.filter(
      (sample) =>
        typeof sample.annotationId === "string" &&
        Number.isFinite(sample.controlPointId) &&
        Number.isFinite(sample.sampledEllipsoidalHeight) &&
        Number.isFinite(sample.officialEllipsoidalHeight) &&
        Array.isArray(sample.scenePosition) &&
        sample.scenePosition.length === 3
    );
  } catch {
    return [];
  }
};

const disposeObject = (object: THREE.Object3D) => {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    materials.forEach((material) => material.dispose());
  });
};

const syncSampleMarkers = (
  group: THREE.Group,
  samples: readonly StoredMeshHeightSample[]
) => {
  for (const child of [...group.children]) {
    group.remove(child);
    disposeObject(child);
  }
  const geometry = new THREE.SphereGeometry(0.11, 14, 10);
  for (const sample of samples) {
    const residual =
      sample.sampledEllipsoidalHeight - sample.officialEllipsoidalHeight;
    const marker = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color: Math.abs(residual) <= 0.1 ? 0x16a34a : 0xef4444,
        depthTest: false,
      })
    );
    marker.position.fromArray(sample.scenePosition);
    marker.renderOrder = 100;
    group.add(marker);
  }
  if (samples.length === 0) geometry.dispose();
};

const isVisibleIntersection = (intersection: THREE.Intersection) => {
  let object: THREE.Object3D | null = intersection.object;
  while (object) {
    if (!object.visible) return false;
    object = object.parent;
  }
  return true;
};

export function MeshNivCalibrationScene() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<CalibrationRuntime>();
  const selectedPointRef = useRef<NivControlPoint>();
  const samplingEnabledRef = useRef(false);
  const [controlPoints, setControlPoints] = useState<NivControlPoint[]>([]);
  const [selectedPointId, setSelectedPointId] = useState<number>();
  const [search, setSearch] = useState("");
  const [samplingEnabled, setSamplingEnabled] = useState(false);
  const [samples, setSamples] =
    useState<StoredMeshHeightSample[]>(loadStoredSamples);
  const [errorTarget, setErrorTarget] = useState(DEFAULT_ERROR_TARGET_PIXELS);
  const [status, setStatus] = useState("Mesh wird initialisiert …");
  const [loadError, setLoadError] = useState<string>();

  const selectedPoint = useMemo(
    () => controlPoints.find((point) => point.id === selectedPointId),
    [controlPoints, selectedPointId]
  );
  const filteredPoints = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("de");
    if (!query) return controlPoints;
    return controlPoints.filter((point) =>
      [
        point.laufende_nummer,
        point.punktnummer_nrw ?? "",
        point.lagebezeichnung,
        point.bemerkung ?? "",
      ].some((value) => value.toLocaleLowerCase("de").includes(query))
    );
  }, [controlPoints, search]);
  const displayedPoints = useMemo(() => {
    const limited = filteredPoints.slice(0, search.trim() ? 300 : 120);
    if (
      !selectedPoint ||
      limited.some((point) => point.id === selectedPoint.id)
    )
      return limited;
    return [selectedPoint, ...limited];
  }, [filteredPoints, search, selectedPoint]);
  const selectedSamples = useMemo(
    () => samples.filter((sample) => sample.controlPointId === selectedPointId),
    [samples, selectedPointId]
  );
  const averagedSamples = useMemo(
    () => averageMeshHeightSamplesByControlPoint(samples),
    [samples]
  );
  const residuals = useMemo(
    () => calculateMeshHeightResiduals(averagedSamples),
    [averagedSamples]
  );
  const metrics = useMemo(
    () => calculateMeshHeightErrorMetrics(samples),
    [samples]
  );
  const selectedAverage = residuals.find(
    (sample) => sample.controlPointId === selectedPointId
  );

  useEffect(() => {
    let cancelled = false;
    loadNivControlPoints()
      .then((points) => {
        if (cancelled) return;
        const current = points
          .filter(
            (point) =>
              !point.historisch &&
              Number.isFinite(point.x) &&
              Number.isFinite(point.y) &&
              Number.isFinite(point.hoehe_ueber_nhn2016) &&
              point.hoehe_ueber_nhn2016 !== 0
          )
          .sort((left, right) =>
            left.lagebezeichnung.localeCompare(right.lagebezeichnung, "de")
          );
        setControlPoints(current);
        const preferred =
          current.find(
            (point) =>
              point.laufende_nummer.trim() === "14" &&
              point.lagebezeichnung
                .toLocaleUpperCase("de")
                .includes("METTMANNER STRASSE 6")
          ) ?? current[0];
        setSelectedPointId((existing) => existing ?? preferred?.id);
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setLoadError(
            error instanceof Error ? error.message : "NIV-Daten nicht geladen"
          );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(SAMPLE_STORAGE_KEY, JSON.stringify(samples));
  }, [samples]);

  useEffect(() => {
    selectedPointRef.current = selectedPoint;
    const runtime = runtimeRef.current;
    if (!selectedPoint || !runtime) return;
    runtime.officialMarker.position.copy(
      nivPointToScenePosition(selectedPoint)
    );
    runtime.officialMarker.visible = true;
    runtime.flyTo(selectedPoint, false);
  }, [selectedPoint]);

  useEffect(() => {
    samplingEnabledRef.current = samplingEnabled;
    const canvas = runtimeRef.current?.renderer.domElement;
    if (canvas) canvas.dataset.pointSample = String(samplingEnabled);
  }, [samplingEnabled]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.setErrorTarget(errorTarget);
  }, [errorTarget]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    syncSampleMarkers(runtime.sampleGroup, samples);
    runtime.requestRender();
  }, [samples]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    container.append(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xdbe7ec);
    const camera = new THREE.PerspectiveCamera(44, 1, 0.03, 60_000);
    camera.position.set(30, 20, 30);
    const controls = createModelNavigationControls(
      camera,
      renderer.domElement,
      { x: 0, y: 0, z: 0 }
    );

    scene.add(new THREE.HemisphereLight(0xffffff, 0x344550, 2.4));
    const sunlight = new THREE.DirectionalLight(0xffffff, 2.8);
    sunlight.position.set(200, 400, 260);
    scene.add(sunlight);

    const sampleGroup = new THREE.Group();
    scene.add(sampleGroup);
    const officialMarker = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.26, 0),
      new THREE.MeshBasicMaterial({
        color: 0x0891b2,
        depthTest: false,
        transparent: true,
        opacity: 0.88,
      })
    );
    officialMarker.visible = false;
    officialMarker.renderOrder = 90;
    scene.add(officialMarker);

    const preview = new THREE.Mesh(
      new THREE.RingGeometry(0.09, 0.15, 28),
      new THREE.MeshBasicMaterial({
        color: 0x06b6d4,
        depthTest: false,
        side: THREE.DoubleSide,
      })
    );
    preview.visible = false;
    preview.renderOrder = 110;
    scene.add(preview);

    let disposed = false;
    let animationFrame = 0;
    let flyAnimationFrame = 0;
    let lastStatus = "";
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDown: [number, number] | undefined;
    let currentHit: THREE.Intersection | undefined;

    const requestRender = () => {
      if (disposed || animationFrame) return;
      animationFrame = window.requestAnimationFrame(render);
    };
    const originLngLat: [number, number] = [
      SCENE_ORIGIN_LONGITUDE_DEGREES,
      SCENE_ORIGIN_LATITUDE_DEGREES,
    ];
    const mesh = createMesh2024TilesRuntime({
      scene,
      renderer,
      camera,
      originLngLat,
      anchorHeightEllipsoidal: SCENE_ORIGIN_ELLIPSOIDAL_HEIGHT,
      opacity: 1,
      errorTarget,
      centerQualityBoost: true,
      debug: false,
      wireframe: false,
      tileBounds: false,
      requestRender,
    });
    const { tiles } = mesh;
    const updateStatus = () => {
      const nextStatus = mesh.getLoadingStatus();
      if (nextStatus !== lastStatus) {
        lastStatus = nextStatus;
        setStatus(nextStatus);
      }
    };
    function render() {
      animationFrame = 0;
      if (disposed) return;
      controls.update();
      tiles.update();
      renderer.render(scene, camera);
      updateStatus();
    }
    const flyTo = (point: NivControlPoint, close: boolean) => {
      window.cancelAnimationFrame(flyAnimationFrame);
      mesh.notifyViewChanged();
      const target = nivPointToScenePosition(point);
      const range = close ? 5.5 : 17;
      const direction = new THREE.Vector3(0.75, 0.38, 1).normalize();
      const startPosition = camera.position.clone();
      const startTarget = controls.target.clone();
      const endPosition = target.clone().addScaledVector(direction, range);
      const startedAt = performance.now();
      const duration = close ? 650 : 950;
      const step = (now: number) => {
        if (disposed) return;
        const linear = Math.min(1, (now - startedAt) / duration);
        const eased = 1 - (1 - linear) ** 3;
        camera.position.lerpVectors(startPosition, endPosition, eased);
        controls.target.lerpVectors(startTarget, target, eased);
        camera.near = 0.03;
        camera.far = 60_000;
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld(true);
        mesh.notifyViewChanged();
        requestRender();
        if (linear < 1) flyAnimationFrame = window.requestAnimationFrame(step);
      };
      flyAnimationFrame = window.requestAnimationFrame(step);
    };

    const runtime: CalibrationRuntime = {
      renderer,
      camera,
      controls,
      sampleGroup,
      officialMarker,
      requestRender,
      flyTo,
      setErrorTarget: mesh.applyErrorTarget,
    };
    runtimeRef.current = runtime;
    syncSampleMarkers(sampleGroup, samples);
    renderer.domElement.dataset.pointSample = String(
      samplingEnabledRef.current
    );

    const resize = () => {
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      mesh.resize(camera, width, height);
      requestRender();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    const updatePointerHit = (event: PointerEvent) => {
      if (!samplingEnabledRef.current) {
        currentHit = undefined;
        preview.visible = false;
        return;
      }
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((event.clientY - bounds.top) / bounds.height) * 2 + 1
      );
      scene.updateMatrixWorld(true);
      raycaster.setFromCamera(pointer, camera);
      currentHit = raycaster
        .intersectObject(tiles.group, true)
        .find(isVisibleIntersection);
      preview.visible = Boolean(currentHit);
      if (currentHit) {
        preview.position.copy(currentHit.point);
        preview.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 0, 1),
          currentHit.face?.normal
            .clone()
            .transformDirection(currentHit.object.matrixWorld) ??
            new THREE.Vector3(0, 1, 0)
        );
      }
      requestRender();
    };
    const onPointerDown = (event: PointerEvent) => {
      pointerDown = [event.clientX, event.clientY];
    };
    const onPointerUp = (event: PointerEvent) => {
      if (
        event.button !== 0 ||
        !pointerDown ||
        !samplingEnabledRef.current ||
        !selectedPointRef.current
      )
        return;
      const moved = Math.hypot(
        event.clientX - pointerDown[0],
        event.clientY - pointerDown[1]
      );
      pointerDown = undefined;
      if (moved > 4) return;
      updatePointerHit(event);
      if (!currentHit) return;
      const controlPoint = selectedPointRef.current;
      const sampledEcef = sceneToEcefPosition(
        currentHit.point,
        ECEF_TO_SCENE
      ).toArray() as [number, number, number];
      const sampledEllipsoidalHeight = ecefEllipsoidalHeight(sampledEcef);
      setSamples((current) => [
        ...current,
        {
          annotationId: crypto.randomUUID(),
          controlPointId: controlPoint.id,
          sampledEllipsoidalHeight,
          officialEllipsoidalHeight: officialEllipsoidalHeight(controlPoint),
          scenePosition: currentHit!.point.toArray() as [
            number,
            number,
            number
          ],
          createdAt: new Date().toISOString(),
        },
      ]);
    };
    const onPointerLeave = () => {
      currentHit = undefined;
      preview.visible = false;
      requestRender();
    };
    renderer.domElement.addEventListener("pointermove", updatePointerHit);
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointerleave", onPointerLeave);
    const onControlsChange = () => {
      mesh.notifyViewChanged();
      requestRender();
    };
    controls.addEventListener("change", onControlsChange);

    if (selectedPointRef.current) {
      const point = selectedPointRef.current;
      officialMarker.position.copy(nivPointToScenePosition(point));
      officialMarker.visible = true;
      flyTo(point, false);
    }
    requestRender();

    return () => {
      disposed = true;
      runtimeRef.current = undefined;
      window.cancelAnimationFrame(animationFrame);
      window.cancelAnimationFrame(flyAnimationFrame);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointermove", updatePointerHit);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
      controls.removeEventListener("change", onControlsChange);
      controls.dispose();
      mesh.dispose();
      disposeObject(sampleGroup);
      disposeObject(officialMarker);
      disposeObject(preview);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  const removeSample = (annotationId: string) =>
    setSamples((current) =>
      current.filter((sample) => sample.annotationId !== annotationId)
    );

  const clearSelectedSamples = () => {
    if (selectedPointId === undefined) return;
    setSamples((current) =>
      current.filter((sample) => sample.controlPointId !== selectedPointId)
    );
  };
  const statusHasError =
    Boolean(loadError) || /Mesh-Fehler|Tile-Fehler/.test(status);

  return (
    <div className="mesh-niv-calibration">
      <div ref={containerRef} className="mesh-niv-calibration-canvas" />

      <section className="mesh-niv-panel mesh-niv-controls">
        <header>
          <div>
            <strong>Mesh 2024 · Höhenprüfung</strong>
            <small>Three.js · ETRS89-Ellipsoidhöhen</small>
          </div>
          <span className="mesh-niv-engine">THREE</span>
        </header>

        <label className="mesh-niv-field">
          Festpunkt suchen
          <input
            type="search"
            value={search}
            placeholder="Nummer, Straße, Bemerkung …"
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label className="mesh-niv-field">
          Amtlicher Höhenfestpunkt
          <Select
            className="mesh-niv-point-select"
            popupClassName="mesh-niv-point-select-popup"
            value={selectedPointId}
            onChange={setSelectedPointId}
            options={displayedPoints.map((point) => ({
              value: point.id,
              label: pointLabel(point),
            }))}
            virtual={false}
          />
          <small>
            {filteredPoints.length.toLocaleString("de-DE")} Treffer · maximal
            300 gleichzeitig angezeigt
          </small>
        </label>

        {selectedPoint && (
          <dl className="mesh-niv-point-details">
            <div>
              <dt>DHHN2016</dt>
              <dd>{formatMeters(selectedPoint.hoehe_ueber_nhn2016)}</dd>
            </div>
            <div>
              <dt>Ellipsoid</dt>
              <dd>{formatMeters(officialEllipsoidalHeight(selectedPoint))}</dd>
            </div>
            <div>
              <dt>UTM32 Lage</dt>
              <dd>
                {selectedPoint.x.toFixed(2)} / {selectedPoint.y.toFixed(2)}
              </dd>
            </div>
            <div>
              <dt>Messung</dt>
              <dd>{selectedPoint.messungsjahr || "–"}</dd>
            </div>
            <div>
              <dt>Quellcodes</dt>
              <dd>
                F {selectedPoint.festlegungsart} · G {selectedPoint.geometrie} ·
                L {selectedPoint.lagegenauigkeit}
              </dd>
            </div>
            <div>
              <dt>Bemerkung</dt>
              <dd>{selectedPoint.bemerkung || "–"}</dd>
            </div>
          </dl>
        )}

        <div className="mesh-niv-button-row">
          <button
            type="button"
            disabled={!selectedPoint}
            onClick={() =>
              selectedPoint && runtimeRef.current?.flyTo(selectedPoint, false)
            }
          >
            <FontAwesomeIcon icon={faPlane} /> Überblick
          </button>
          <button
            type="button"
            disabled={!selectedPoint}
            onClick={() =>
              selectedPoint && runtimeRef.current?.flyTo(selectedPoint, true)
            }
          >
            <FontAwesomeIcon icon={faCrosshairs} /> Nahansicht
          </button>
        </div>

        <p className="mesh-niv-navigation-hint">
          Touchpad: Ziehen dreht · ⇧/⌘/Ctrl + Ziehen verschiebt ·
          Zwei-Finger-Scrollen zoomt.
        </p>

        <button
          type="button"
          className="mesh-niv-sample-toggle"
          aria-pressed={samplingEnabled}
          onClick={() => setSamplingEnabled((current) => !current)}
        >
          <FontAwesomeIcon icon={faLocationDot} />
          {samplingEnabled ? "Punktprobe aktiv" : "Punktprobe setzen"}
        </button>
        <p className="mesh-niv-instruction">
          Wandbolzen: sichtbare Oberkante anklicken. Andere Marken:
          geometrisches Zentrum. Die türkise Raute ist nur eine grobe
          Suchposition; ihre Lage wird nicht als Referenzfehler ausgewertet.
        </p>

        <label className="mesh-niv-quality">
          <span>
            Ziel-Screenfehler <output>{errorTarget.toFixed(2)} px</output>
          </span>
          <input
            type="range"
            min={0.25}
            max={4}
            step={0.05}
            value={errorTarget}
            onChange={(event) => setErrorTarget(Number(event.target.value))}
          />
          <small>Kleiner = höhere Mesh-LOD. Standard: 0,50 px.</small>
        </label>
      </section>

      <section className="mesh-niv-panel mesh-niv-metrics">
        <header>
          <div>
            <strong>Geodätischer Höhenfehler</strong>
            <small>Δh = Mesh − amtlich · nur Vertikalachse</small>
          </div>
          <span>{metrics?.count ?? 0} Punkte</span>
        </header>
        <dl className="mesh-niv-metric-grid">
          <div>
            <dt>Bias Ø</dt>
            <dd>{formatSignedCentimeters(metrics?.meanBiasMeters)}</dd>
          </div>
          <div>
            <dt>MAE Ø</dt>
            <dd>{formatCentimeters(metrics?.meanAbsoluteErrorMeters)}</dd>
          </div>
          <div>
            <dt>RMSE</dt>
            <dd>{formatCentimeters(metrics?.rootMeanSquareErrorMeters)}</dd>
          </div>
          <div>
            <dt>σ</dt>
            <dd>{formatCentimeters(metrics?.standardDeviationMeters)}</dd>
          </div>
          <div>
            <dt>Minimum</dt>
            <dd>{formatSignedCentimeters(metrics?.minimumResidualMeters)}</dd>
          </div>
          <div>
            <dt>Maximum</dt>
            <dd>{formatSignedCentimeters(metrics?.maximumResidualMeters)}</dd>
          </div>
        </dl>
        <p className="mesh-niv-metric-note">
          {metrics
            ? `${metrics.sampleCount} Punktproben; Wiederholungen je Festpunkt werden vor der Gesamtstatistik gemittelt.`
            : "Noch keine Punktprobe. Die Statistik beginnt mit dem ersten vermaschten Treffer."}
        </p>

        {selectedPoint && (
          <div className="mesh-niv-selected-result">
            <strong>{pointLabel(selectedPoint)}</strong>
            <span>
              Punktmittel:{" "}
              {formatSignedCentimeters(selectedAverage?.residualMeters)}
            </span>
            <span>
              Mesh DHHN2016:{" "}
              {selectedAverage
                ? formatMeters(
                    ellipsoidalToPointDhhN2016Height(
                      selectedPoint,
                      selectedAverage.sampledEllipsoidalHeight
                    )
                  )
                : "–"}
            </span>
          </div>
        )}

        <div className="mesh-niv-sample-list">
          {selectedSamples.map((sample, index) => (
            <div key={sample.annotationId}>
              <span>Probe {index + 1}</span>
              <code>
                {formatSignedCentimeters(
                  sample.sampledEllipsoidalHeight -
                    sample.officialEllipsoidalHeight
                )}
              </code>
              <button
                type="button"
                aria-label={`Probe ${index + 1} löschen`}
                onClick={() => removeSample(sample.annotationId)}
              >
                <FontAwesomeIcon icon={faTrash} />
              </button>
            </div>
          ))}
        </div>
        {selectedSamples.length > 0 && (
          <button
            type="button"
            className="mesh-niv-clear"
            onClick={clearSelectedSamples}
          >
            Proben dieses Festpunkts löschen
          </button>
        )}
      </section>

      <div className={`mesh-niv-status${statusHasError ? " is-error" : ""}`}>
        {loadError ?? status}
      </div>
    </div>
  );
}
