import { useEffect, useRef, useState } from "react";
import type { CanvasImageStrip } from "@carma-commons/ui/components";
import {
  createSharedSceneCameraStrip,
  observeMapVectorPoints,
  type MapVectorPoint,
} from "@carma-mapping/engines/maplibre";
import { TileLoadingDebug } from "@carma-mapping/tile-diagnostics-ui";

import {
  PUBLIC_BELIS_LIGHT_STYLE,
  TILE_STRESS_PRESETS,
} from "./tile-stress-presets";
import type { TileCameraStressArgs, World } from "./tile-camera-stress-types";
import { useTileStressCameraRig } from "./use-tile-stress-camera-rig";
import { useTileStressLights } from "./use-tile-stress-lights";
import { useTileStressNightTraffic } from "./use-tile-stress-night-traffic";
import { useTileStressPresentation } from "./use-tile-stress-presentation";
import { useTileStressWorld } from "./use-tile-stress-world";

import "maplibre-gl/dist/maplibre-gl.css";
import "./tile-camera-stress.css";

export type { TileCameraStressArgs } from "./tile-camera-stress-types";

export function TileCameraStressDemo(args: TileCameraStressArgs) {
  const showBothSides =
    !!args.pairedSides && (args.streetView ?? "both") === "both";
  const upperSide: 1 | -1 = args.pairedSides
    ? args.streetView === "right" ||
      (showBothSides && args.upperStreetSide === "right")
      ? -1
      : 1
    : args.side;
  const isLongCorridor =
    args.path === "schwebebahn" || args.path === "urban-street";
  const container = useRef<HTMLDivElement>(null);
  const stripCanvas = useRef<HTMLCanvasElement>(null);
  const stripViewport = useRef<HTMLDivElement>(null);
  const stripPresentation = useRef<CanvasImageStrip | null>(null);
  const oppositeViewport = useRef<HTMLDivElement>(null);
  const oppositePresentation = useRef<CanvasImageStrip | null>(null);
  const oppositeStrip = useRef<ReturnType<
    typeof createSharedSceneCameraStrip
  > | null>(null);
  const navigationRange = useRef<readonly [number, number] | null>(null);
  const arrayStrip = useRef<ReturnType<
    typeof createSharedSceneCameraStrip
  > | null>(null);
  const [elevationOffset, setElevationOffset] = useState(0);
  const elevationOffsetRef = useRef(0);
  elevationOffsetRef.current = elevationOffset;
  const controls = useRef(args);
  controls.current = args;
  const [world, setWorld] = useState<World | null>(null);
  const [status, setStatus] = useState("Loading shared scene…");
  const [error, setError] = useState("");
  const [points, setPoints] = useState<readonly MapVectorPoint[]>([]);
  const nightPoints = useRef(points);
  nightPoints.current = points;
  const nightSync = useRef<(() => void) | null>(null);
  const [station, setStation] = useState(0);
  const [segments, setSegments] = useState(0);
  const [stripLabels, setStripLabels] = useState<
    readonly { label: string; width: number }[]
  >([]);
  const [stripWidth, setStripWidth] = useState(0);
  const [stripScrollable, setStripScrollable] = useState(false);
  const isNight = args.scenario === "night-traffic";
  const isLight =
    args.scenario === "orbit" || args.scenario === "streetlights" || isNight;
  const showStrip = !isLight || args.showLightViews;
  const closedStrip = !isLight && (args.scenario !== "facade" || args.closed);
  const stripLabelHeight = 0;
  // Storybook clones object args on unrelated control changes. Only changed
  // coordinates of an active custom path should rebuild the camera rig.
  const customSpineKey = JSON.stringify(
    args.path === "custom" ? args.customSpine : []
  );
  const presetName =
    args.scenario === "orbit"
      ? "HKW chimney"
      : args.scenario === "facade" &&
        (args.path === "wupper-bank" || args.path === "schwebebahn")
      ? "Wupper north bank / Barmen"
      : args.scenario === "streetlights" || args.scenario === "facade"
      ? "Rathaus Barmen"
      : args.preset;
  const preset = TILE_STRESS_PRESETS[presetName];

  const paintSegment = (
    offset: number,
    pixels: Uint8Array,
    width: number,
    height: number
  ) => {
    const context = stripCanvas.current?.getContext("2d");
    if (!context) return;
    const frame = context.createImageData(width, height);
    for (let row = 0; row < height; row++)
      frame.data.set(
        pixels.subarray(
          (height - row - 1) * width * 4,
          (height - row) * width * 4
        ),
        row * width * 4
      );
    context.putImageData(frame, offset, stripLabelHeight);
    stripPresentation.current?.refresh();
  };

  useTileStressWorld(
    args,
    container,
    controls,
    presetName,
    isLight,
    isNight,
    isLongCorridor,
    setWorld,
    setError
  );

  useEffect(() => {
    world?.runtime.setErrorTarget?.(args.pixelError);
  }, [world, args.pixelError]);

  useEffect(() => {
    arrayStrip.current?.setElevationOffset(elevationOffset);
    oppositeStrip.current?.setElevationOffset(elevationOffset);
    world?.map.triggerRepaint();
  }, [world, elevationOffset]);

  useEffect(() => {
    setElevationOffset(0);
  }, [world, args.elevation]);

  useEffect(() => {
    if (!world || (args.scenario !== "streetlights" && !isNight)) return;
    setPoints([]);
    return observeMapVectorPoints(world.map, PUBLIC_BELIS_LIGHT_STYLE, {
      idPrefix: "public-belis",
      center: TILE_STRESS_PRESETS["Rathaus Barmen"].center,
      radiusMeters: isNight ? 900 : 350,
      limit: args.lightCount,
      onPoints: setPoints,
      onError: (reason) => setError(String(reason)),
    });
  }, [world, args.scenario, args.lightCount, isNight]);

  useEffect(() => {
    nightSync.current?.();
  }, [points]);

  useTileStressNightTraffic(
    args,
    world,
    isNight,
    controls,
    nightPoints,
    nightSync,
    setStatus,
    setError
  );

  useTileStressCameraRig({
    args,
    world,
    controls,
    presetName,
    customSpineKey,
    isLight,
    showBothSides,
    upperSide,
    elevationOffsetRef,
    stripCanvas,
    stripViewport,
    stripPresentation,
    oppositeViewport,
    oppositePresentation,
    oppositeStrip,
    navigationRange,
    arrayStrip,
    paintSegment,
    stripLabelHeight,
    setError,
    setStatus,
    setSegments,
    setStation,
    setStripLabels,
    setStripWidth,
  });

  useTileStressLights(
    args,
    world,
    controls,
    isLight,
    points,
    stripCanvas,
    paintSegment,
    setError,
    setStatus,
    setSegments,
    setStripLabels,
    setStripWidth
  );

  useTileStressPresentation({
    args,
    world,
    controls,
    showStrip,
    isLight,
    closedStrip,
    showBothSides,
    upperSide,
    stripCanvas,
    stripViewport,
    stripPresentation,
    oppositeViewport,
    oppositePresentation,
    oppositeStrip,
    navigationRange,
    arrayStrip,
    stripLabelHeight,
    setStation,
    setElevationOffset,
    setStripScrollable,
  });

  useEffect(() => {
    stripPresentation.current?.refresh();
    oppositePresentation.current?.refresh();
  }, [stripWidth]);

  const navigate = (value: number) => {
    setStation(value);
    stripPresentation.current?.setPosition(value);
  };
  const reviewContent = (
    <aside className="tile-stress-review" data-test-id="tile-stress-review">
      <strong>Review erforderlich: </strong>
      {isNight
        ? "Lokale Barmen-Nachtszene: BELIS-Standorte und OSM-Wege, aber synthetischer Verkehr und Ampelphasen. Feste Lichtfelder sind im Worker gebacken, ohne Gebäude-Verdeckung; keine zertifizierte Licht-/Schattenberechnung. Stadtweit deaktiviert: vollständige Leuchtenabdeckung und Verdeckungsbudget sind nicht belegt."
        : isLight
        ? "Lichtansichten sind einzelne Cube-Faces, kein zusammenhängendes Panorama. Bewegte Frames entstehen nacheinander; keine synchrone Sichtbarkeitsmessung."
        : args.scenario === "facade"
        ? args.path === "schwebebahn"
          ? "Gesamte Schwebebahn: Querblick zwischen OSM-Ufern; wo keine sichere Wasserfläche vorliegt, angenommener Straßenkorridor (±12 m). Gemeinsame Höhenbasis für die ganze Wand, keine segmentweise Geländeanpassung. Nur sichtbare Segmente sind aktive Kameras; Ziehen verschiebt das Fenster entlang der Strecke."
          : args.path === "urban-street"
          ? "B7-Talachse: Straßenseiten einzeln oder synchron aufgeklappt, mit gemeinsamer Höhenbasis. Straßenbreite und Fassadenhöhen sind nicht vermessen. Kein belegtes Verkehrsstärke-Ranking."
          : args.path === "perimeter"
          ? "Rathaus: nach außen versetzte ALKIS-Hülllinie, hinten je Streifen knapp hinter dem Gebäude begrenzt. Dachüberstände sind nicht vermessen; Rücksprünge und Innenhöfe bleiben vereinfacht."
          : args.path === "wupper-bank"
          ? "Blick vom Nordufer quer über die Wupper: Tiefe je Streifen bis zum Gegenufer plus 8 m Brückenrand. Höhenfenster 145–185 m geschätzt; Brückenränder sind nicht vermessen."
          : "Eigene Leitlinie: Lage, Höhen, Blickseite und vollständiger Dach-/Fassadenausschnitt sind ungeprüft."
        : args.mode === "object-cover"
        ? "Orthografische Ansichten nach innen. Der Streifen zeigt überlappende Ansichten eines Objekts, keine verzerrungsfreie Oberflächenabwicklung."
        : "Virtueller Aussichtspunkt. Nahes Mauerwerk darf sichtbar sein; Augenhöhe und Hindernisse sind nicht als realer Besucherstandort bestätigt."}
      {
        " Abdeckung ist noch nicht für jede Kamera belegt; fehlende Geometrie bedeutet nicht freie Sicht. "
      }
      {args.source === "terrain" &&
        "DGM zeigt nur Gelände: Gebäude, Fassaden und Vegetation fehlen absichtlich. "}
      {args.clipping &&
        "Clipping entfernt Vordergrundgeometrie; das Ergebnis ist eine Schnittansicht, kein unverdeckter realer Blick. "}
      {args.scenario === "facade" &&
        args.closed &&
        args.path !== "perimeter" &&
        args.spineMergeAngleDegrees > 0 &&
        "Review: Beim geschlossenen Ring kann der Startpunkt die zusammengefassten Segmente beeinflussen. "}
      {args.scenario === "facade" &&
        args.path === "wupper-bank" &&
        args.closed &&
        "Review: Der Ringschluss ist eine künstliche Verbindung, kein erfasstes Ufer. "}
    </aside>
  );
  const navigationHelp = (
    <p>
      {isLight
        ? "Sechs Ansichten vom gewählten Lichtpunkt: +X, −X, +Y, −Y, +Z, −Z. Kein analytisch zertifiziertes Viewshed."
        : "Bildnavigation: Ziehen zum Verschieben, Mausrad/Trackpad zum Zoomen, Pfeiltasten und +/−, 0 für Einpassen. Alt + vertikales Ziehen ändert die Höhe des gesamten Arrays. Geschlossene Ringe laufen nahtlos weiter; offene Streifen haben Enden. Die Übersichtskarte bewegt den Kameraverbund nicht. Sichtbare Segmente zeichnen gemeinsam direkt in die Karten-Canvas."}
      {args.scenario === "facade" &&
        " Leitlinie/Höhe sind editierbare Referenzen, kein vermessenes Fassadenmodell."}
      {args.elevation !== 0
        ? ` Editierte Szenenhöhe: ${args.elevation.toFixed(
            2
          )} m; keine vermessene Kameraposition.`
        : isLongCorridor
        ? " Höhenreferenz: ein gemeinsames Preset-Höhenfenster für die ganze Wand. Alt + vertikales Ziehen verschiebt alle Kameras gemeinsam; keine vermessene Gleis- oder Fassadenhöhe. © OpenStreetMap contributors (ODbL)."
        : ` Höhenreferenz: ${preset.elevationNote}`}
      {args.scenario === "facade" &&
        args.path === "wupper-bank" &&
        ` Nordufer der Wupper aus basemap.de-Gewässerflächen, keine versetzte Bahntrasse. Knicke über ${args.spineMergeAngleDegrees}° erhalten eigene Kamerasegmente. © 2026 basemap.de / BKG, GeoBasis-DE.`}
      {args.scenario === "facade" &&
        args.fitVertical &&
        !isLongCorridor &&
        args.path !== "custom" &&
        "verticalWindow" in preset &&
        ` Höhenfenster: ${preset.verticalWindow.minElevation.toFixed(
          1
        )}–${preset.verticalWindow.maxElevation.toFixed(1)} m plus ${
          args.verticalPadding
        } m Rand. ${preset.verticalWindow.note}`}
    </p>
  );
  return (
    <main
      className={`tile-stress${isLight ? "" : " tile-stress-camera"}`}
      data-test-id="tile-stress"
    >
      {isLight && (
        <header role="status" data-test-id="tile-stress-status">
          {status}
        </header>
      )}
      {isLight && reviewContent}
      {error && <p role="alert">{error}</p>}
      <div className="tile-stress-map-shell">
        <div
          ref={container}
          className="tile-stress-map"
          data-test-id="tile-stress-map"
          style={
            isNight
              ? { height: "calc(100vh - 170px)", minHeight: 550 }
              : undefined
          }
        />
        {world && (
          <TileLoadingDebug map={world.map} runtimeHandle={world.mesh} />
        )}
        {showStrip && !isLight && (
          <div
            ref={stripViewport}
            className="tile-stress-strip tile-stress-strip-embedded"
            style={showBothSides ? { bottom: "26%", height: "26%" } : undefined}
            aria-label="Unrolled camera images"
          />
        )}
        {showStrip && !isLight && showBothSides && (
          <div
            ref={oppositeViewport}
            className="tile-stress-strip tile-stress-strip-embedded"
            style={{ height: "26%" }}
            aria-label="Opposite street side · unfolded downward"
          />
        )}
      </div>
      {isNight && (
        <p>
          Drei Straßenfragmente, Schwebebahn und DB-Gleis aus © OpenStreetMap
          contributors (ODbL). 23-Uhr-Stimmung, kein Live-Verkehr oder Fahrplan.
          Autos: zwei Frontscheinwerfer, rote Rücklichter; Ampeln: Rot →
          Rot/Gelb → Grün → Gelb. Höhen aus DGM, Leuchtenmasthöhe angenommen{" "}
          {args.mastHeight} m; Schwebebahn-Trasse angenommen 13 m über Gelände.
          Brückenhöhen, Gleisüberhöhung und Verdeckungen: Review erforderlich.
          Nicht mit Geländehöhen belegte Routen bleiben deaktiviert. Fahrzeuge
          erscheinen und verschwinden an den Grenzen der Datenfragmente.
        </p>
      )}
      {showStrip && (
        <>
          <label>
            {isLight
              ? "Cube-Faces"
              : args.scenario === "facade"
              ? "Strecke"
              : "Blickrichtung"}
            {stripScrollable && (
              <input
                aria-label="Spine station"
                type="range"
                min="0"
                max="1"
                step="0.001"
                value={station}
                onChange={(event) => navigate(Number(event.target.value))}
              />
            )}
          </label>
          <div className="tile-stress-strip-tools">
            <button
              type="button"
              aria-label="Ansicht einpassen"
              title="Ansicht einpassen"
              onClick={() => stripPresentation.current?.resetView()}
            >
              ⛶
            </button>

            {!isLight && (
              <span>
                <button
                  type="button"
                  aria-label="Gesamtes Kamera-Array absenken"
                  title="1 m nach unten · Umschalt: 10 m"
                  onClick={(event) =>
                    setElevationOffset(
                      (value) => value - (event.shiftKey ? 10 : 1)
                    )
                  }
                >
                  ▼
                </button>{" "}
                <output title="Höhenversatz des gesamten Arrays">
                  {elevationOffset > 0 ? "+" : ""}
                  {elevationOffset.toFixed(1)} m
                </output>{" "}
                <button
                  type="button"
                  aria-label="Gesamtes Kamera-Array anheben"
                  title="1 m nach oben · Umschalt: 10 m"
                  onClick={(event) =>
                    setElevationOffset(
                      (value) => value + (event.shiftKey ? 10 : 1)
                    )
                  }
                >
                  ▲
                </button>{" "}
                <button
                  type="button"
                  title="Höhe zurücksetzen"
                  aria-label="Höhe zurücksetzen"
                  disabled={elevationOffset === 0}
                  onClick={() => setElevationOffset(0)}
                >
                  ↺
                </button>
              </span>
            )}
            {!isLight && (
              <details className="tile-stress-info">
                <summary
                  aria-label="Informationen zur Kameraansicht"
                  title="Bedienung, Daten und Diagnose"
                >
                  ⓘ
                </summary>
                <div className="tile-stress-info-content">
                  <h3>Kameraansicht</h3>
                  <header role="status" data-test-id="tile-stress-status">
                    {status}
                  </header>
                  <p>{segments} Kamerasegmente · ein gemeinsamer Tile-Pool</p>
                  {navigationHelp}
                  {args.pairedSides && (
                    <p>
                      {showBothSides
                        ? `Oben: ${
                            upperSide === 1 ? "links" : "rechts"
                          } · unten: Gegenseite nach unten aufgeklappt. Gleiche Station und Zoom; links/rechts relativ zur Leitlinie West → Ost.`
                        : `${
                            upperSide === 1 ? "Linke" : "Rechte"
                          } Straßenseite · Einzelansicht. Links/rechts relativ zur Leitlinie West → Ost.`}
                    </p>
                  )}
                  {args.scenario === "facade" && (
                    <p>
                      Referenzfläche: {args.referenceSurfaceOffset ?? 0} m ab
                      Leitlinie in Blickrichtung. Segmentkanten schließen dort
                      aneinander an. Vor und hinter dieser Fläche bleiben bei
                      Knicken orthografische Parallaxen möglich; die
                      Vordergrund-Schnittebene bleibt unabhängig.
                    </p>
                  )}

                  {reviewContent}
                </div>
              </details>
            )}
          </div>
          {isLight && (
            <div
              ref={stripViewport}
              className="tile-stress-strip"
              aria-label="Unrolled camera images"
            />
          )}
          <canvas ref={stripCanvas} hidden data-test-id="tile-stress-strip" />
          <div
            className="tile-stress-strip-labels"
            aria-label="Camera segments"
          >
            {stripLabels.map(({ label }, index) => (
              <span key={index}>{label}</span>
            ))}
          </div>
          {isLight && navigationHelp}
        </>
      )}
      {isLight && !isNight && (
        <p>
          Live-Punktlichtschatten auf gemeinsam geladenem{" "}
          {args.source === "mesh" ? "2024-Mesh" : "DGM-Gelände (ohne Gebäude)"}.
          Schatten sind keine zertifizierte Sichtbarkeitsanalyse. Alle
          Lichtansichten fordern Geometrie aus demselben Pool an.
        </p>
      )}
    </main>
  );
}
