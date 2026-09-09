import { useEffect, useMemo, useState, type ReactNode } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheck,
  faCopy,
  faPlus,
  faRotateLeft,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";
import {
  ColorPicker,
  InputNumber,
  Segmented,
  Slider,
  Switch,
  Tooltip,
} from "antd";

import { useLibreContext } from "@carma-mapping/contexts";

import {
  FLOW_FIELD_OPTION_DEFAULTS,
  FLOW_FIELD_PARAM_DEFAULTS,
  type FlowFieldParams,
  type FlowFieldZoomProfileEntry,
  type UvCorrection,
} from "../../lib/caged-addons";
import { useFlowFieldActions } from "./flowfield-actions";

/**
 * Every knob the particle animation has, on one panel, plus the object literal
 * that reproduces what is on screen.
 *
 * This is a workbench, not a product surface: it is behind `?ff=admin` and it
 * exists so a scenario's numbers can be found by watching the map rather than
 * by editing `workflows.ts`, reloading and comparing from memory. What comes
 * out of it is the paste: the copy button writes a `FlowFieldDefinition`
 * fragment that goes straight into the card.
 *
 * Two kinds of knob live here and the difference matters. Everything under
 * `params` plus the opacity reaches the running layer through `setParams` and
 * `setOpacity`, so those are live and dragging them is free. The rest is
 * constructor-only: changing it tears the layer down and builds a new one,
 * which asks the rasterfari for the velocity field again. Those controls
 * therefore commit on release, never during a drag.
 */

const ACCENT = "#1677ff";

/** how far the profile editor lets a row go */
const ZOOM_RANGE: [number, number] = [8, 24];

/**
 * Puts one value back to what cage would use if nothing set it.
 *
 * Disabled rather than hidden while the value already is that default, so the
 * row keeps its width and the button doubles as the readout for "this is
 * untouched": what is dark on the panel is what this scenario changes.
 */
const ResetButton = ({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) => (
  <Tooltip title={disabled ? "Steht auf dem Standard" : label}>
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded border-0 bg-transparent text-[11px] text-gray-500 hover:bg-black/5 hover:text-gray-800 disabled:cursor-default disabled:text-gray-300 disabled:hover:bg-transparent"
    >
      <FontAwesomeIcon icon={faRotateLeft} />
    </button>
  </Tooltip>
);

const Row = ({
  label,
  hint,
  reset,
  children,
}: {
  label: string;
  hint?: string;
  /** the field's own reset, at the end of the row */
  reset?: ReactNode;
  children: ReactNode;
}) => (
  <div className="flex items-center gap-3 py-1">
    <label className="mb-0 w-[190px] shrink-0 text-[13px] text-gray-700">
      {label}
      {hint && (
        <span className="ml-1 font-mono text-[11px] text-gray-400">{hint}</span>
      )}
    </label>
    <div className="flex min-w-0 grow items-center gap-3">{children}</div>
    {reset ?? <span className="h-6 w-6 shrink-0" />}
  </div>
);

const Section = ({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) => (
  <section className="min-w-0">
    <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
      {title}
    </h3>
    {note && <p className="mb-1 mt-0 text-[11px] text-gray-400">{note}</p>}
    {children}
  </section>
);

/**
 * A slider whose value is only committed when the drag ends.
 *
 * What it guards is a rebuild of the map layer, which refetches the velocity
 * field: committing per pixel of the drag would put a request storm on the
 * rasterfari.
 */
const ReleaseSlider = ({
  value,
  min,
  max,
  step,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onCommit: (next: number) => void;
}) => {
  const [draft, setDraft] = useState<number | null>(null);
  return (
    <Slider
      className="grow"
      min={min}
      max={max}
      step={step}
      value={draft ?? value}
      onChange={setDraft}
      onChangeComplete={(next) => {
        setDraft(null);
        onCommit(next);
      }}
      style={{ margin: 0 }}
    />
  );
};

const NumberReadout = ({ children }: { children: ReactNode }) => (
  <span className="w-[52px] shrink-0 text-right text-[12px] tabular-nums text-gray-500">
    {children}
  </span>
);

/**
 * What the zoom profile makes of a flat value at the map's current zoom.
 *
 * Shown only when the two differ, which is exactly when the slider next to it
 * is no longer what the screen is drawing with. Without it a row overriding
 * `pathFactor` turns the Dichte slider into a control that visibly does
 * nothing.
 */
const ProfileOverride = ({
  effective,
  flat,
  unit = "",
}: {
  effective: number | undefined;
  flat: number;
  unit?: string;
}) => (
  <span
    className="w-[70px] shrink-0 text-[11px] tabular-nums text-[#1677ff]"
    title="Das Zoomprofil überschreibt diesen Wert beim aktuellen Kartenzoom"
  >
    {effective === undefined || Math.abs(effective - flat) < 1e-9
      ? ""
      : `hier ${short(Number(effective.toFixed(2)))}${unit}`}
  </span>
);

/** a number as short as it can be written without losing what was set */
const short = (value: number): string =>
  Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));

const sameProfile = (
  a: FlowFieldZoomProfileEntry[],
  b: FlowFieldZoomProfileEntry[]
): boolean =>
  a.length === b.length &&
  a.every(
    (row, index) =>
      row.zoom === b[index].zoom &&
      row.fade === b[index].fade &&
      row.maxAge === b[index].maxAge &&
      row.pathFactor === b[index].pathFactor &&
      row.speed === b[index].speed &&
      row.width === b[index].width
  );

const sameUv = (a: UvCorrection, b: UvCorrection): boolean =>
  a.u === b.u && a.v === b.v;

/**
 * Fade and lifetime at a fractional zoom, plus how much each row contributed.
 *
 * The interpolation is cage's `profileAt` (`FlowFieldParticles/particles.ts`),
 * repeated here because carma cannot import from cage. What the panel adds is
 * `weights`: the share each row has in the result, keyed by its zoom. A zoom
 * sitting exactly on a row, or outside the table, gives that one row a share
 * of 1 and every other row nothing; a zoom between two rows splits the share
 * between them. Rows with no share are not marked, which is what keeps the
 * neighbour below an exact hit out of the highlight.
 */
type InForce = {
  fade: number;
  maxAge: number;
  pathFactor: number;
  speed: number;
  width: number;
  weights: Map<number, number>;
};

const linear = (a: number, b: number, t: number): number => a + (b - a) * t;

/** cage's interpolation for `pathFactor`; see `FlowFieldZoomProfileEntry` */
const geometric = (a: number, b: number, t: number): number =>
  a > 0 && b > 0 ? a * Math.pow(b / a, t) : linear(a, b, t);

const profileAt = (
  profile: FlowFieldZoomProfileEntry[],
  zoom: number,
  base: Required<
    Pick<FlowFieldParams, "pathFactor" | "speed" | "width">
  >
): InForce => {
  const rows = [...profile].sort((a, b) => a.zoom - b.zoom);
  const resolve = (row: FlowFieldZoomProfileEntry) => ({
    fade: row.fade,
    maxAge: row.maxAge,
    pathFactor: row.pathFactor ?? base.pathFactor,
    speed: row.speed ?? base.speed,
    width: row.width ?? base.width,
  });
  if (rows.length === 0) {
    return { fade: 0.9, maxAge: 100, ...base, weights: new Map() };
  }
  const only = (row: FlowFieldZoomProfileEntry): InForce => ({
    ...resolve(row),
    weights: new Map([[row.zoom, 1]]),
  });
  if (zoom <= rows[0].zoom) return only(rows[0]);
  const last = rows[rows.length - 1];
  if (zoom >= last.zoom) return only(last);
  for (let i = 1; i < rows.length; i++) {
    const hi = rows[i];
    if (zoom > hi.zoom) continue;
    const t = (zoom - rows[i - 1].zoom) / (hi.zoom - rows[i - 1].zoom);
    if (t === 0) return only(rows[i - 1]);
    if (t === 1) return only(hi);
    const lo = resolve(rows[i - 1]);
    const up = resolve(hi);
    return {
      fade: linear(lo.fade, up.fade, t),
      maxAge: linear(lo.maxAge, up.maxAge, t),
      pathFactor: geometric(lo.pathFactor, up.pathFactor, t),
      speed: linear(lo.speed, up.speed, t),
      width: linear(lo.width, up.width, t),
      weights: new Map([
        [rows[i - 1].zoom, 1 - t],
        [hi.zoom, t],
      ]),
    };
  }
  return only(last);
};

/**
 * The map's zoom as it changes, so the profile can point at the row in force.
 *
 * Local to the panel rather than published into the channel: a zoom is written
 * on every frame of a wheel gesture, and the channel is mirrored into
 * `localStorage` on every write.
 */
const useMapZoom = (): number | null => {
  const { map } = useLibreContext();
  const [zoom, setZoom] = useState<number | null>(null);

  useEffect(() => {
    if (!map) {
      setZoom(null);
      return undefined;
    }
    const read = () => setZoom(map.getZoom());
    read();
    map.on("zoom", read);
    return () => {
      map.off("zoom", read);
    };
  }, [map]);

  return zoom;
};

/** an object literal as it would be written in `workflows.ts` */
const literal = (value: unknown, indent = 2): string => {
  const pad = " ".repeat(indent);
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const rows = value.map((entry) => `${pad}  ${literal(entry, indent + 2)}`);
    return `[\n${rows.join(",\n")},\n${pad}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return "{}";
    // A profile row is three short numbers and reads better on one line than
    // as five; anything else gets a line per key.
    // a profile row is up to six short numbers and reads better on one line;
    // `uvCorrection` is two. Everything else gets a line per key.
    const isShort =
      entries.length <= 6 &&
      entries.every(([, entryValue]) => typeof entryValue === "number");
    if (isShort) {
      const inline = entries
        .map(([key, entryValue]) => `${key}: ${literal(entryValue, indent)}`)
        .join(", ");
      return `{ ${inline} }`;
    }
    const rows = entries.map(
      ([key, entryValue]) => `${pad}  ${key}: ${literal(entryValue, indent + 2)}`
    );
    return `{\n${rows.join(",\n")},\n${pad}}`;
  }
  return "undefined";
};

export const FlowFieldTuningPanel = () => {
  const {
    title,
    service,
    scenario,
    layerPostfix,
    uvCorrection,
    minZoom,
    animateWhileMoving,
    opacity,
    viewportBuffer,
    debounceMs,
    occlusion,
    params,
    backdrop,
    fallback,
    isCaged,
    isActive,
    isLoading,
    setOpacity,
    setTuning,
  } = useFlowFieldActions();

  const mapZoom = useMapZoom();
  const [scope, setScope] = useState<"delta" | "full">("delta");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  /**
   * What the layer is actually drawing with: what the channel holds, filled in
   * from cage's defaults for every key nothing has set. The panel works on
   * this, so a control never starts at a value the map does not show.
   */
  const resolved = useMemo(
    () => ({ ...FLOW_FIELD_PARAM_DEFAULTS, ...params }),
    [params]
  );
  const uv = uvCorrection ?? FLOW_FIELD_OPTION_DEFAULTS.uvCorrection;

  /**
   * Sends the parameters whole. `setParams` in cage merges, so a key that goes
   * back to its default has to be written as that default rather than dropped.
   */
  const patchParams = (patch: Partial<FlowFieldParams>) =>
    setTuning({ params: { ...resolved, ...patch } });

  /** one drawing parameter back to cage's default, the others left alone */
  const resetParam = <K extends keyof typeof FLOW_FIELD_PARAM_DEFAULTS>(
    key: K
  ) => patchParams({ [key]: FLOW_FIELD_PARAM_DEFAULTS[key] } as FlowFieldParams);

  /**
   * The default profile row for a zoom, when the default table has one at that
   * zoom. A row the user moved to 16.5, or added beyond the table, has nothing
   * to be put back to and its reset stays disabled.
   */
  const defaultProfileRow = (zoom: number) =>
    FLOW_FIELD_PARAM_DEFAULTS.profile.find((row) => row.zoom === zoom);

  /**
   * A cleared override is written as `undefined` by the input, and a key that
   * is present with an undefined value is not the same thing as an absent one:
   * `JSON.stringify` drops it on the way into `localStorage` but the export
   * would print it. Dropped here instead, so what the panel holds is what the
   * paste says.
   */
  const patchProfile = (
    index: number,
    patch: Partial<FlowFieldZoomProfileEntry>
  ) =>
    patchParams({
      profile: resolved.profile
        .map((row, at) => {
          if (at !== index) return row;
          const merged = { ...row, ...patch } as Record<string, unknown>;
          for (const key of Object.keys(merged)) {
            if (merged[key] === undefined) delete merged[key];
          }
          return merged as unknown as FlowFieldZoomProfileEntry;
        })
        .sort((a, b) => a.zoom - b.zoom),
    });

  /** what the zoom profile currently works out to, and the rows that say it */
  const inForce = useMemo(
    () =>
      mapZoom === null
        ? null
        : profileAt(resolved.profile, mapZoom, {
            pathFactor: resolved.pathFactor,
            speed: resolved.speed,
            width: resolved.width,
          }),
    [resolved, mapZoom]
  );

  const config = useMemo(() => {
    const tuning: Record<string, unknown> = {};
    const defaults = FLOW_FIELD_OPTION_DEFAULTS;
    const all = scope === "full";

    if (all || !sameUv(uv, defaults.uvCorrection)) tuning.uvCorrection = uv;
    if (all || minZoom !== defaults.minZoom) tuning.minZoom = minZoom;
    if (all || animateWhileMoving !== defaults.animateWhileMoving) {
      tuning.animateWhileMoving = animateWhileMoving;
    }
    if (all || opacity !== defaults.opacity) tuning.opacity = opacity;
    if (all || viewportBuffer !== defaults.viewportBuffer) {
      tuning.viewportBuffer = viewportBuffer;
    }
    if (all || debounceMs !== defaults.debounceMs) {
      tuning.debounceMs = debounceMs;
    }
    if (all || occlusion !== defaults.occlusion) tuning.occlusion = occlusion;

    const drawing: Record<string, unknown> = {};
    if (all || resolved.pathFactor !== FLOW_FIELD_PARAM_DEFAULTS.pathFactor) {
      drawing.pathFactor = resolved.pathFactor;
    }
    if (all || resolved.speed !== FLOW_FIELD_PARAM_DEFAULTS.speed) {
      drawing.speed = resolved.speed;
    }
    if (all || resolved.width !== FLOW_FIELD_PARAM_DEFAULTS.width) {
      drawing.width = resolved.width;
    }
    if (all || resolved.color !== FLOW_FIELD_PARAM_DEFAULTS.color) {
      drawing.color = resolved.color;
    }
    if (
      all ||
      !sameProfile(resolved.profile, FLOW_FIELD_PARAM_DEFAULTS.profile)
    ) {
      drawing.profile = resolved.profile;
    }
    if (Object.keys(drawing).length > 0) tuning.params = drawing;

    // The whole definition is only worth writing out when everything else is;
    // the delta is meant to be dropped into a card that already names its data.
    const identity = all
      ? {
          title,
          service,
          scenario,
          ...(layerPostfix ? { layerPostfix } : {}),
        }
      : {};
    const sources = all
      ? {
          ...(backdrop ? { backdrop } : {}),
          ...(fallback ? { fallback } : {}),
        }
      : {};

    return literal({ ...identity, ...tuning, ...sources }, 0);
  }, [
    scope,
    title,
    service,
    scenario,
    layerPostfix,
    uv,
    minZoom,
    animateWhileMoving,
    opacity,
    viewportBuffer,
    debounceMs,
    occlusion,
    resolved,
    backdrop,
    fallback,
  ]);

  const copy = () => {
    setCopyError(null);
    const write = navigator.clipboard?.writeText(config);
    if (!write) {
      setCopyError("Die Zwischenablage ist hier nicht erreichbar.");
      return;
    }
    void write.then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      },
      (error: unknown) => {
        console.warn("[FLOW FIELD] the config could not be copied", error);
        setCopyError("Die Zwischenablage ist hier nicht erreichbar.");
      }
    );
  };

  const reset = () =>
    setTuning({
      params: {},
      uvCorrection: undefined,
      minZoom: FLOW_FIELD_OPTION_DEFAULTS.minZoom,
      animateWhileMoving: FLOW_FIELD_OPTION_DEFAULTS.animateWhileMoving,
      opacity: FLOW_FIELD_OPTION_DEFAULTS.opacity,
      viewportBuffer: FLOW_FIELD_OPTION_DEFAULTS.viewportBuffer,
      debounceMs: FLOW_FIELD_OPTION_DEFAULTS.debounceMs,
      occlusion: FLOW_FIELD_OPTION_DEFAULTS.occlusion,
    });

  const status = !isCaged
    ? "cage fehlt, es läuft nichts"
    : isLoading
    ? "Feld wird geladen"
    : isActive
    ? "läuft"
    : "unter der Zoomschwelle";

  return (
    <div
      className="relative max-h-[70vh] w-[100vw] shrink-0 overflow-y-auto rounded-[10px] bg-white px-4 py-3 shadow-lg sm:w-[86vw] sm:max-w-[560px] md:max-w-[720px]"
      data-test-id="flow-field-tuning"
    >
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="mb-0 text-sm font-medium text-gray-800">
          Partikel-Parameter
        </h2>
        <span className="text-[11px] text-gray-400">{status}</span>
      </div>

      <div className="flex flex-col gap-3">
        <Section title="Zeichnung">
          <Row
            label="Farbe"
            hint="color"
            reset={
              <ResetButton
                label="Farbe zurücksetzen"
                disabled={resolved.color === FLOW_FIELD_PARAM_DEFAULTS.color}
                onClick={() => resetParam("color")}
              />
            }
          >
            <ColorPicker
              value={resolved.color}
              onChangeComplete={(color) =>
                patchParams({ color: color.toHexString() })
              }
              showText
              size="small"
            />
          </Row>
          <Row
            label="Strichbreite"
            hint="width"
            reset={
              <ResetButton
                label="Strichbreite zurücksetzen"
                disabled={resolved.width === FLOW_FIELD_PARAM_DEFAULTS.width}
                onClick={() => resetParam("width")}
              />
            }
          >
            <Slider
              className="grow"
              min={0.25}
              max={6}
              step={0.25}
              value={resolved.width}
              onChange={(width: number) => patchParams({ width })}
              style={{ margin: 0 }}
            />
            <NumberReadout>{short(resolved.width)} px</NumberReadout>
            <ProfileOverride
              effective={inForce?.width}
              flat={resolved.width}
              unit=" px"
            />
          </Row>
          <Row
            label="Dichte"
            hint="pathFactor"
            reset={
              <ResetButton
                label="Dichte zurücksetzen"
                disabled={
                  resolved.pathFactor === FLOW_FIELD_PARAM_DEFAULTS.pathFactor
                }
                onClick={() => resetParam("pathFactor")}
              />
            }
          >
            <Slider
              className="grow"
              min={0.5}
              max={40}
              step={0.5}
              value={resolved.pathFactor}
              onChange={(pathFactor: number) => patchParams({ pathFactor })}
              style={{ margin: 0 }}
            />
            <NumberReadout>{short(resolved.pathFactor)}</NumberReadout>
            <ProfileOverride
              effective={inForce?.pathFactor}
              flat={resolved.pathFactor}
            />
          </Row>
          <Row
            label="Geschwindigkeit"
            hint="speed"
            reset={
              <ResetButton
                label="Geschwindigkeit zurücksetzen"
                disabled={resolved.speed === FLOW_FIELD_PARAM_DEFAULTS.speed}
                onClick={() => resetParam("speed")}
              />
            }
          >
            <Slider
              className="grow"
              min={1}
              max={240}
              step={1}
              value={resolved.speed}
              onChange={(speed: number) => patchParams({ speed })}
              style={{ margin: 0 }}
            />
            <NumberReadout>{short(resolved.speed)}</NumberReadout>
            <ProfileOverride
              effective={inForce?.speed}
              flat={resolved.speed}
            />
          </Row>
          <Row
            label="Deckkraft"
            hint="opacity"
            reset={
              <ResetButton
                label="Deckkraft zurücksetzen"
                disabled={opacity === FLOW_FIELD_OPTION_DEFAULTS.opacity}
                onClick={() => setOpacity(FLOW_FIELD_OPTION_DEFAULTS.opacity)}
              />
            }
          >
            <Slider
              className="grow"
              min={0}
              max={1}
              step={0.01}
              value={opacity}
              onChange={setOpacity}
              style={{ margin: 0 }}
            />
            <NumberReadout>{Math.round(opacity * 100)}%</NumberReadout>
          </Row>
        </Section>

        <Section
          title="Zoomprofil"
          note="fade ist die Deckkraft, die eine gezeichnete Spur pro Bild behält; maxAge die Lebensdauer eines Partikels in Bildern. Die drei rechten Spalten überschreiben den flachen Wert aus der Zeichnung für diesen Zoom; bleiben sie leer, gilt er weiter. Zwischen den Zeilen wird interpoliert, außerhalb gilt die nächste Zeile. pathFactor wird dabei verdoppelnd interpoliert, der Rest linear."
        >
          <div className="flex flex-col gap-1">
            {/* Which rows the map is currently between, and what they work out
                to there. Without it the table is six rows of numbers with
                nothing saying which of them the screen is showing. */}
            <div className="mb-1 rounded bg-gray-50 px-2 py-1 text-[11px] tabular-nums text-gray-600">
              {inForce === null ? (
                "Kartenzoom unbekannt"
              ) : (
                <>
                  Karte bei Zoom{" "}
                  <span className="font-medium text-gray-900">
                    {(mapZoom ?? 0).toFixed(2)}
                  </span>
                  {inForce.weights.size > 1 ? " (zwischen zwei Zeilen)" : ""}
                  {" · wirksam: fade "}
                  <span className="font-medium text-gray-900">
                    {inForce.fade.toFixed(3)}
                  </span>
                  {", maxAge "}
                  <span className="font-medium text-gray-900">
                    {Math.round(inForce.maxAge)}
                  </span>
                  {", pathFactor "}
                  <span className="font-medium text-gray-900">
                    {short(Number(inForce.pathFactor.toFixed(1)))}
                  </span>
                  {", speed "}
                  <span className="font-medium text-gray-900">
                    {short(Number(inForce.speed.toFixed(1)))}
                  </span>
                  {", width "}
                  <span className="font-medium text-gray-900">
                    {short(Number(inForce.width.toFixed(2)))}
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-1.5 pl-[10px] text-[10px] uppercase tracking-wide text-gray-400">
              <span className="w-[62px]">zoom</span>
              <span className="w-[76px]">fade</span>
              <span className="w-[68px]">maxAge</span>
              <span className="w-[76px]">pathFactor</span>
              <span className="w-[62px]">speed</span>
              <span className="w-[56px]">width</span>
            </div>
            {resolved.profile.map((row, index) => {
              const standard = defaultProfileRow(row.zoom);
              const weight = inForce?.weights.get(row.zoom) ?? 0;
              const isInForce = weight > 0;
              return (
              <div
                key={`${index}-${row.zoom}`}
                className={`flex items-center gap-1.5 rounded border-0 border-l-[3px] border-solid py-0.5 pl-[7px] ${
                  isInForce
                    ? "border-l-[#1677ff] bg-[#1677ff0d]"
                    : "border-l-transparent"
                }`}
                title={
                  weight === 1
                    ? "Gilt beim aktuellen Kartenzoom"
                    : isInForce
                    ? "Die Karte liegt zwischen zwei Zeilen; diese geht mit " +
                      `${Math.round(weight * 100)} % ein`
                    : undefined
                }
              >
                <InputNumber
                  size="small"
                  className="w-[62px]"
                  min={ZOOM_RANGE[0]}
                  max={ZOOM_RANGE[1]}
                  step={0.5}
                  value={row.zoom}
                  onChange={(zoom) =>
                    typeof zoom === "number" && patchProfile(index, { zoom })
                  }
                />
                <InputNumber
                  size="small"
                  className="w-[76px]"
                  min={0}
                  max={0.999}
                  step={0.005}
                  value={row.fade}
                  onChange={(fade) =>
                    typeof fade === "number" && patchProfile(index, { fade })
                  }
                />
                <InputNumber
                  size="small"
                  className="w-[68px]"
                  min={1}
                  max={2000}
                  step={10}
                  value={row.maxAge}
                  onChange={(maxAge) =>
                    typeof maxAge === "number" &&
                    patchProfile(index, { maxAge })
                  }
                />
                {/* The three overrides. Empty means "take the flat value", and
                    the placeholder shows which value that is, so a blank cell
                    is readable rather than merely unset. Clearing one writes
                    `undefined`, which drops the key from the exported row. */}
                <InputNumber
                  size="small"
                  className="w-[76px]"
                  min={0.1}
                  max={400}
                  step={1}
                  placeholder={short(resolved.pathFactor)}
                  value={row.pathFactor ?? null}
                  onChange={(pathFactor) =>
                    patchProfile(index, {
                      pathFactor:
                        typeof pathFactor === "number" ? pathFactor : undefined,
                    })
                  }
                />
                <InputNumber
                  size="small"
                  className="w-[62px]"
                  min={0}
                  max={400}
                  step={1}
                  placeholder={short(resolved.speed)}
                  value={row.speed ?? null}
                  onChange={(speed) =>
                    patchProfile(index, {
                      speed: typeof speed === "number" ? speed : undefined,
                    })
                  }
                />
                <InputNumber
                  size="small"
                  className="w-[56px]"
                  min={0.25}
                  max={12}
                  step={0.25}
                  placeholder={short(resolved.width)}
                  value={row.width ?? null}
                  onChange={(width) =>
                    patchProfile(index, {
                      width: typeof width === "number" ? width : undefined,
                    })
                  }
                />
                <ResetButton
                  label={
                    standard
                      ? `Zeile auf den Standard bei Zoom ${short(
                          row.zoom
                        )} zurücksetzen`
                      : "Für diesen Zoom gibt es keinen Standard"
                  }
                  disabled={
                    !standard ||
                    (standard.fade === row.fade &&
                      standard.maxAge === row.maxAge &&
                      row.pathFactor === undefined &&
                      row.speed === undefined &&
                      row.width === undefined)
                  }
                  // the default table carries no overrides, so putting a row
                  // back means clearing them as well as restoring the two
                  onClick={() =>
                    standard &&
                    patchProfile(index, {
                      fade: standard.fade,
                      maxAge: standard.maxAge,
                      pathFactor: undefined,
                      speed: undefined,
                      width: undefined,
                    })
                  }
                />
                <Tooltip title="Zeile entfernen">
                  <button
                    type="button"
                    aria-label="Zeile entfernen"
                    className="flex h-6 w-6 cursor-pointer items-center justify-center rounded border-0 bg-transparent text-gray-400 hover:bg-black/5 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={resolved.profile.length <= 1}
                    onClick={() =>
                      patchParams({
                        profile: resolved.profile.filter(
                          (_, at) => at !== index
                        ),
                      })
                    }
                  >
                    <FontAwesomeIcon icon={faTrash} />
                  </button>
                </Tooltip>
                {/* Two rows are marked whenever the map sits between them, and
                    without this that reads as "both are active". The share
                    says what marking them actually means. */}
                <span className="w-[44px] shrink-0 text-[10px] tabular-nums text-[#1677ff]">
                  {weight === 1
                    ? "gilt"
                    : isInForce
                    ? `${Math.round(weight * 100)} %`
                    : ""}
                </span>
              </div>
              );
            })}
            <div className="mt-1 flex items-center gap-4">
              <button
                type="button"
                className="flex w-fit cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-[13px] text-gray-600 hover:text-gray-900"
                onClick={() => {
                  const last = resolved.profile[resolved.profile.length - 1];
                  patchParams({
                    profile: [
                      ...resolved.profile,
                      {
                        // the last row carried on, overrides included: a table
                        // that doubles `pathFactor` is extended by editing one
                        // number rather than by typing the row again
                        ...(last ?? {}),
                        zoom: Math.min(ZOOM_RANGE[1], (last?.zoom ?? 16) + 1),
                        fade: last?.fade ?? 0.9,
                        maxAge: last?.maxAge ?? 100,
                      },
                    ],
                  });
                }}
              >
                <FontAwesomeIcon icon={faPlus} />
                Zeile hinzufügen
              </button>
              <button
                type="button"
                className="flex w-fit cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-[13px] text-gray-600 hover:text-gray-900 disabled:cursor-default disabled:text-gray-300"
                disabled={sameProfile(
                  resolved.profile,
                  FLOW_FIELD_PARAM_DEFAULTS.profile
                )}
                onClick={() => resetParam("profile")}
              >
                <FontAwesomeIcon icon={faRotateLeft} />
                Ganzes Profil zurücksetzen
              </button>
            </div>
          </div>
        </Section>

        <Section
          title="Datenfeld"
          note="Diese Werte gehen in den Aufbau der Ebene. Eine Änderung baut sie neu auf und holt das Geschwindigkeitsfeld erneut vom Server, deshalb greifen die Regler erst beim Loslassen."
        >
          <Row
            label="Zoomschwelle"
            hint="minZoom"
            reset={
              <ResetButton
                label="Zoomschwelle zurücksetzen"
                disabled={minZoom === FLOW_FIELD_OPTION_DEFAULTS.minZoom}
                onClick={() =>
                  setTuning({ minZoom: FLOW_FIELD_OPTION_DEFAULTS.minZoom })
                }
              />
            }
          >
            <ReleaseSlider
              value={minZoom}
              min={10}
              max={21}
              step={0.5}
              onCommit={(next) => setTuning({ minZoom: next })}
            />
            <NumberReadout>{short(minZoom)}</NumberReadout>
          </Row>
          <Row
            label="Kachelpuffer"
            hint="viewportBuffer"
            reset={
              <ResetButton
                label="Kachelpuffer zurücksetzen"
                disabled={
                  viewportBuffer === FLOW_FIELD_OPTION_DEFAULTS.viewportBuffer
                }
                onClick={() =>
                  setTuning({
                    viewportBuffer: FLOW_FIELD_OPTION_DEFAULTS.viewportBuffer,
                  })
                }
              />
            }
          >
            <ReleaseSlider
              value={viewportBuffer}
              min={1}
              max={3}
              step={0.05}
              onCommit={(next) => setTuning({ viewportBuffer: next })}
            />
            <NumberReadout>{short(viewportBuffer)}×</NumberReadout>
          </Row>
          <Row
            label="Wartezeit"
            hint="debounceMs"
            reset={
              <ResetButton
                label="Wartezeit zurücksetzen"
                disabled={debounceMs === FLOW_FIELD_OPTION_DEFAULTS.debounceMs}
                onClick={() =>
                  setTuning({
                    debounceMs: FLOW_FIELD_OPTION_DEFAULTS.debounceMs,
                  })
                }
              />
            }
          >
            <ReleaseSlider
              value={debounceMs}
              min={0}
              max={2000}
              step={50}
              onCommit={(next) => setTuning({ debounceMs: next })}
            />
            <NumberReadout>{debounceMs} ms</NumberReadout>
          </Row>
          <Row
            label="u/v-Vorzeichen"
            hint="uvCorrection"
            reset={
              <ResetButton
                label="u/v-Vorzeichen zurücksetzen"
                disabled={sameUv(uv, FLOW_FIELD_OPTION_DEFAULTS.uvCorrection)}
                // cleared rather than written out: an absent `uvCorrection` is
                // what a definition looks like when it takes cage's
                onClick={() => setTuning({ uvCorrection: undefined })}
              />
            }
          >
            <span className="text-[12px] text-gray-500">u</span>
            <InputNumber
              size="small"
              className="w-[84px]"
              step={0.1}
              value={uv.u}
              onChange={(u) =>
                typeof u === "number" &&
                setTuning({ uvCorrection: { ...uv, u } })
              }
            />
            <span className="text-[12px] text-gray-500">v</span>
            <InputNumber
              size="small"
              className="w-[84px]"
              step={0.1}
              value={uv.v}
              onChange={(v) =>
                typeof v === "number" &&
                setTuning({ uvCorrection: { ...uv, v } })
              }
            />
          </Row>
          <Row
            label="Während der Bewegung"
            hint="animateWhileMoving"
            reset={
              <ResetButton
                label="Auf Standard zurücksetzen"
                disabled={
                  animateWhileMoving ===
                  FLOW_FIELD_OPTION_DEFAULTS.animateWhileMoving
                }
                onClick={() =>
                  setTuning({
                    animateWhileMoving:
                      FLOW_FIELD_OPTION_DEFAULTS.animateWhileMoving,
                  })
                }
              />
            }
          >
            <Switch
              size="small"
              checked={animateWhileMoving}
              onChange={(next) => setTuning({ animateWhileMoving: next })}
            />
          </Row>
          <Row
            label="Verdeckung durch 3D"
            hint="occlusion"
            reset={
              <ResetButton
                label="Auf Standard zurücksetzen"
                disabled={occlusion === FLOW_FIELD_OPTION_DEFAULTS.occlusion}
                onClick={() =>
                  setTuning({ occlusion: FLOW_FIELD_OPTION_DEFAULTS.occlusion })
                }
              />
            }
          >
            <Switch
              size="small"
              checked={occlusion}
              onChange={(next) => setTuning({ occlusion: next })}
            />
          </Row>
        </Section>

        <Section title="Übernehmen">
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              size="small"
              value={scope}
              onChange={(next) => setScope(next as "delta" | "full")}
              options={[
                { label: "Abweichungen", value: "delta" },
                { label: "Vollständig", value: "full" },
              ]}
            />
            <button
              type="button"
              className="flex cursor-pointer items-center gap-2 rounded-md border-0 px-3 py-1 text-[13px] text-white"
              style={{ backgroundColor: ACCENT }}
              onClick={copy}
            >
              <FontAwesomeIcon icon={copied ? faCheck : faCopy} />
              {copied ? "Kopiert" : "In die Zwischenablage"}
            </button>
            <button
              type="button"
              className="flex cursor-pointer items-center gap-2 border-0 bg-transparent px-1 text-[13px] text-gray-600 hover:text-gray-900"
              onClick={reset}
            >
              <FontAwesomeIcon icon={faRotateLeft} />
              Auf Standard
            </button>
          </div>
          {copyError && (
            <p className="mb-0 mt-2 text-[12px] text-red-600">{copyError}</p>
          )}
          <pre className="mt-2 mb-0 max-h-[180px] overflow-auto rounded-md bg-gray-50 p-2 font-mono text-[11px] leading-[1.45] text-gray-700">
            {config}
          </pre>
        </Section>
      </div>
    </div>
  );
};

/**
 * What the host's interaction view mounts. The row it is opened from is the
 * addon's own, so the `layer` prop the host passes says nothing this component
 * does not already read from the channel.
 */
export const FlowFieldTuningInteractionPanel = () => <FlowFieldTuningPanel />;
