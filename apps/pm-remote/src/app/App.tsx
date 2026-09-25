import { useCallback, useEffect, useMemo, useState } from "react";

import type { MappingConfigLayer } from "@carma-api";
import {
  layerOpacity,
  layerTitle,
  type RelayTarget,
  type Show,
  type ShowScene,
} from "@carma-mapping/show-remote";

import { showErrorText } from "./messages";
import { PointerPanel } from "./PointerPanel";
import { SeriesControl } from "./SeriesControl";
import { SettingsPanel } from "./SettingsPanel";
import {
  FADE_CHOICES,
  loadSettings,
  saveSettings,
  type RemoteSettings,
} from "./settings";
import { loadShow } from "./show-cache";
import { useDisplay, type Connection } from "./useDisplay";
import { usePointer } from "./usePointer";
import { useWakeLock } from "./useWakeLock";

type ShowLoad =
  | { status: "none" }
  | { status: "loading" }
  | { status: "ready"; show: Show }
  | { status: "error"; text: string };

const NO_SCENES: readonly ShowScene[] = [];

const CONNECTION_LABEL: Record<Connection, string> = {
  idle: "Kein Sitzungscode",
  connecting: "Verbinde …",
  connected: "Verbunden",
  error: "Fehler",
};

const CONNECTION_DOT: Record<Connection, string> = {
  idle: "bg-neutral-600",
  connecting: "bg-amber-400 animate-pulse",
  connected: "bg-emerald-500",
  error: "bg-red-500",
};

const fadeLabel = (ms: number): string =>
  ms === 0 ? "Schnitt" : `${(ms / 1000).toLocaleString("de-DE")} s`;

const isTyping = (target: EventTarget | null): boolean =>
  target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;

const LayerSlider = ({
  layer,
  disabled,
  onChange,
}: {
  layer: MappingConfigLayer;
  disabled: boolean;
  onChange: (opacity: number) => void;
}) => {
  const percent = Math.round(layerOpacity(layer) * 100);
  const id = `pm-remote-layer-${layer.id}`;
  return (
    <li className="flex flex-col gap-1 py-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="truncate text-sm text-neutral-300">
          {layerTitle(layer)}
        </label>
        <span className="text-sm tabular-nums text-neutral-400">
          {percent} %
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={1}
        value={percent}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value) / 100)}
        className="h-10 w-full accent-amber-400 disabled:opacity-40"
      />
    </li>
  );
};

export const App = () => {
  const [settings, setSettings] = useState<RemoteSettings>(() =>
    loadSettings()
  );
  const [isSettingsOpen, setIsSettingsOpen] = useState(
    () => settings.code === "" || settings.showKey === ""
  );
  const [showLoad, setShowLoad] = useState<ShowLoad>({ status: "none" });

  const { relayBaseUrl, code, showKey, fadeMs } = settings;
  const target = useMemo<RelayTarget | null>(
    () => (code && relayBaseUrl ? { baseUrl: relayBaseUrl, code } : null),
    [relayBaseUrl, code]
  );

  useEffect(() => {
    if (!showKey) {
      setShowLoad({ status: "none" });
      return;
    }
    let isCurrent = true;
    setShowLoad({ status: "loading" });
    loadShow(showKey).then(
      (show) => {
        if (isCurrent) {
          setShowLoad({ status: "ready", show });
        }
      },
      (error: unknown) => {
        if (isCurrent) {
          setShowLoad({ status: "error", text: showErrorText(error) });
        }
      }
    );
    return () => {
      isCurrent = false;
    };
  }, [showKey]);

  // A republish replaces the show under the same key. Coming back to the
  // remote is when the presenter expects to see it, so read it again then.
  useEffect(() => {
    if (!showKey) {
      return;
    }
    let isCurrent = true;
    const refresh = () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      loadShow(showKey).then(
        (show) => {
          if (isCurrent) {
            setShowLoad((current) =>
              current.status === "loading" ? current : { status: "ready", show }
            );
          }
        },
        () => {
          // keeps the show it has; the first load reports errors
        }
      );
    };
    document.addEventListener("visibilitychange", refresh);
    return () => {
      isCurrent = false;
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [showKey]);

  const scenes =
    showLoad.status === "ready" ? showLoad.show.scenes : NO_SCENES;
  const display = useDisplay(target, scenes, fadeMs);
  const {
    activeSceneId,
    goToScene,
    isBlackout,
    setBlackout,
    live,
    isChanging,
  } = display;
  useWakeLock(display.connection === "connected");
  const pointer = usePointer(target, display.setPointerChannel);

  const updateSettings = useCallback((next: RemoteSettings) => {
    saveSettings(next);
    setSettings(next);
  }, []);

  const activeIndex = scenes.findIndex(({ id }) => id === activeSceneId);
  const step = useCallback(
    (delta: number) => {
      // with no scene on the display yet, either direction starts the show
      const nextIndex = activeIndex < 0 ? 0 : activeIndex + delta;
      if (
        nextIndex !== activeIndex &&
        nextIndex >= 0 &&
        nextIndex < scenes.length
      ) {
        goToScene(scenes[nextIndex]);
      }
    },
    [scenes, activeIndex, goToScene]
  );
  const canGoBack = activeIndex > 0;
  const canGoOn = scenes.length > 0 && activeIndex < scenes.length - 1;

  // a presenter clicker sends the arrow and page keys; "b" and "." black the
  // screen, as in the usual slide programs
  useEffect(() => {
    if (isSettingsOpen) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event.target) || event.metaKey || event.ctrlKey) {
        return;
      }
      if (["ArrowRight", "PageDown", " "].includes(event.key)) {
        event.preventDefault();
        if (canGoOn) {
          step(1);
        }
      } else if (["ArrowLeft", "PageUp"].includes(event.key)) {
        event.preventDefault();
        if (canGoBack) {
          step(-1);
        }
      } else if (["b", "B", "."].includes(event.key)) {
        setBlackout(!isBlackout);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isSettingsOpen, canGoOn, canGoBack, step, setBlackout, isBlackout]);

  if (isSettingsOpen) {
    return (
      <div className="mx-auto min-h-full max-w-xl pt-safe-top-xs">
        <SettingsPanel
          settings={settings}
          onSave={(next) => {
            updateSettings(next);
            setIsSettingsOpen(false);
          }}
          onCancel={
            settings.code && settings.showKey
              ? () => setIsSettingsOpen(false)
              : undefined
          }
        />
      </div>
    );
  }

  const title =
    showLoad.status === "ready" ? showLoad.show.title : "Fernbedienung";

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col pt-safe-top-xs">
      <header className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <h1 className="m-0 truncate text-lg font-semibold">{title}</h1>
          <div className="flex items-center gap-2 text-xs text-neutral-400">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                CONNECTION_DOT[display.connection]
              }`}
            />
            <span>
              {CONNECTION_LABEL[display.connection]}
              {code ? ` · ${code}` : ""}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsSettingsOpen(true)}
          className="min-h-[44px] rounded-lg bg-neutral-800 px-4 text-sm active:bg-neutral-700"
        >
          Verbindung
        </button>
      </header>

      {display.error && (
        <p className="m-0 mx-4 mb-2 rounded-lg bg-red-950 px-3 py-2 text-sm text-red-200">
          {display.error}
        </p>
      )}
      {pointer.status === "closed" && pointer.error && (
        <p className="m-0 mx-4 mb-2 rounded-lg bg-red-950 px-3 py-2 text-sm text-red-200">
          Zeiger: {pointer.error}
        </p>
      )}

      <main className="flex flex-1 flex-col gap-5 px-4 pb-4">
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={!live}
            onClick={() => setBlackout(!isBlackout)}
            className={`min-h-[64px] rounded-2xl text-lg font-semibold disabled:opacity-40 ${
              isBlackout
                ? "bg-red-600 text-white active:bg-red-500"
                : "border border-neutral-700 bg-neutral-900 text-neutral-100 active:bg-neutral-800"
            }`}
          >
            {isBlackout ? "Blackout aus" : "Blackout"}
          </button>
          {/* the tap itself has to ask for motion access, iOS allows it only here */}
          <button
            type="button"
            disabled={!target || display.connection !== "connected"}
            onClick={pointer.open}
            className="min-h-[64px] rounded-2xl border border-neutral-700 bg-neutral-900 text-lg font-semibold text-neutral-100 active:bg-neutral-800 disabled:opacity-40"
          >
            Zeiger
          </button>
        </div>

        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-sm font-medium uppercase tracking-wide text-neutral-500">
            Szenen
          </h2>
          {showLoad.status === "loading" && (
            <p className="m-0 text-neutral-400">Show wird geladen …</p>
          )}
          {showLoad.status === "error" && (
            <p className="m-0 text-red-300">{showLoad.text}</p>
          )}
          {showLoad.status === "none" && (
            <p className="m-0 text-neutral-400">
              Keine Show gewählt. Unter „Verbindung“ den Schlüssel eintragen.
            </p>
          )}
          <ol className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3">
            {scenes.map((scene, index) => {
              const isActive = scene.id === activeSceneId;
              return (
                <li key={scene.id}>
                  <button
                    type="button"
                    disabled={!target}
                    onClick={() => goToScene(scene)}
                    className={`flex min-h-[88px] w-full flex-col items-start justify-between rounded-2xl p-3 text-left disabled:opacity-40 ${
                      isActive
                        ? "bg-amber-400 text-neutral-950"
                        : "bg-neutral-800 text-neutral-100 active:bg-neutral-700"
                    }`}
                  >
                    <span className="text-xs tabular-nums opacity-70">
                      {index + 1}
                    </span>
                    <span className="text-base font-semibold leading-tight">
                      {scene.title}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-sm font-medium uppercase tracking-wide text-neutral-500">
            Übergang
          </h2>
          <div className="grid grid-cols-4 gap-2">
            {FADE_CHOICES.map((choice) => (
              <button
                key={choice}
                type="button"
                onClick={() => updateSettings({ ...settings, fadeMs: choice })}
                className={`min-h-[48px] rounded-xl text-sm ${
                  fadeMs === choice
                    ? "bg-neutral-100 font-semibold text-neutral-950"
                    : "bg-neutral-800 text-neutral-200 active:bg-neutral-700"
                }`}
              >
                {fadeLabel(choice)}
              </button>
            ))}
          </div>
        </section>

        {live && live.layers.length > 0 && (
          <section className="flex flex-col">
            <h2 className="m-0 text-sm font-medium uppercase tracking-wide text-neutral-500">
              Ebenen {isChanging ? "· Übergang läuft" : ""}
            </h2>
            <ul className="m-0 list-none divide-y divide-neutral-800 p-0">
              {live.layers.map((layer) => (
                <LayerSlider
                  key={layer.id}
                  layer={layer}
                  disabled={isChanging}
                  onChange={(opacity) =>
                    display.setLayerOpacity(layer.id, opacity)
                  }
                />
              ))}
            </ul>
          </section>
        )}

        {display.series && display.seriesClock && (
          <SeriesControl
            series={display.series}
            clock={display.seriesClock}
            disabled={!target}
            onPlay={display.setSeriesPlaying}
            onSeek={display.seekSeries}
          />
        )}
      </main>

      <nav className="sticky bottom-0 grid grid-cols-2 gap-3 border-t border-neutral-800 bg-neutral-950 px-4 pb-safe-bottom-xs pt-3">
        <button
          type="button"
          disabled={!target || !canGoBack}
          onClick={() => step(-1)}
          className="mb-3 min-h-[64px] rounded-2xl bg-neutral-800 text-lg font-semibold active:bg-neutral-700 disabled:opacity-40"
        >
          ‹ Zurück
        </button>
        <button
          type="button"
          disabled={!target || !canGoOn}
          onClick={() => step(1)}
          className="mb-3 min-h-[64px] rounded-2xl bg-neutral-100 text-lg font-semibold text-neutral-950 active:bg-neutral-300 disabled:opacity-40"
        >
          Weiter ›
        </button>
      </nav>

      {pointer.status !== "closed" && <PointerPanel pointer={pointer} />}
    </div>
  );
};
