import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";

import type { MappingConfigLayer } from "@carma-api";
import {
  layerOpacity,
  layerTitle,
  storyGroups,
  type RelayTarget,
  type Show,
  type ShowScene,
} from "@carma-mapping/show-remote";

import { showErrorText } from "./messages";
import { PointerPanel } from "./PointerPanel";
import { SeriesControl } from "./SeriesControl";
import { ShadowCard } from "./ShadowCard";
import { SettingsPanel } from "./SettingsPanel";
import { loadSettings, saveSettings, type RemoteSettings } from "./settings";
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

const isTyping = (target: EventTarget | null): boolean =>
  target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;

const LONG_PRESS_MS = 500;

/**
 * A tap and a long press on the same element. The long press swallows the
 * click the browser sends when the finger lifts.
 */
const useTapOrLongPress = (onTap: () => void, onLongPress: () => void) => {
  const timerRef = useRef<number | null>(null);
  const firedRef = useRef(false);
  const cancel = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };
  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    },
    []
  );
  return {
    onPointerDown: () => {
      firedRef.current = false;
      cancel();
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        firedRef.current = true;
        onLongPress();
      }, LONG_PRESS_MS);
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    // the long press would otherwise open the phone's own menu
    onContextMenu: (event: MouseEvent) => event.preventDefault(),
    onClick: () => {
      if (firedRef.current) {
        firedRef.current = false;
        return;
      }
      onTap();
    },
  };
};

const Sheet = ({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) => (
  <div
    role="dialog"
    aria-modal="true"
    aria-label={title}
    className="fixed inset-0 z-20 flex flex-col bg-neutral-950 pt-safe-top-xs"
  >
    <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3">
      <h2 className="m-0 min-w-0 flex-1 truncate text-lg font-semibold">
        {title}
      </h2>
      <button
        type="button"
        onClick={onClose}
        className="min-h-[44px] rounded-lg bg-neutral-800 px-4 text-sm active:bg-neutral-700"
      >
        Schließen
      </button>
    </div>
    <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-4 pb-safe-bottom-xs">
      {children}
    </div>
  </div>
);

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
  const [sheet, setSheet] = useState<"layers" | null>(null);
  // null is the overview of all stories
  const [openStoryId, setOpenStoryId] = useState<string | null>(null);

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

  const scenes = showLoad.status === "ready" ? showLoad.show.scenes : NO_SCENES;
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

  const groups = useMemo(
    () => (showLoad.status === "ready" ? storyGroups(showLoad.show) : []),
    [showLoad]
  );
  const liveGroup = groups.find((group) =>
    group.scenes.some(({ id }) => id === activeSceneId)
  );
  // a story that a republish removed falls back to the overview
  const openGroup = groups.find(({ story }) => story.id === openStoryId);
  /**
   * Weiter and Zurück stay in the open story, or in the live one on the
   * overview, where only a clicker's keys reach them. In a story that is not
   * live, Weiter starts its first scene.
   */
  const walk =
    openGroup?.scenes ?? liveGroup?.scenes ?? groups.at(0)?.scenes ?? NO_SCENES;
  const activeIndex = walk.findIndex(({ id }) => id === activeSceneId);
  const activeScene = activeIndex >= 0 ? walk[activeIndex] : undefined;
  const step = useCallback(
    (delta: number) => {
      const nextIndex = activeIndex < 0 ? 0 : activeIndex + delta;
      if (
        nextIndex !== activeIndex &&
        nextIndex >= 0 &&
        nextIndex < walk.length
      ) {
        goToScene(walk[nextIndex]);
      }
    },
    [walk, activeIndex, goToScene]
  );
  const canGoBack = activeIndex > 0;
  const canGoOn = walk.length > 0 && activeIndex < walk.length - 1;

  // a tap on the live card opens the live story, a long press the sliders
  const titlePress = useTapOrLongPress(
    () => {
      if (!openGroup && liveGroup) {
        setOpenStoryId(liveGroup.story.id);
      }
    },
    () => setSheet("layers")
  );

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

  const showTitle =
    showLoad.status === "ready" ? showLoad.show.title : "Fernbedienung";
  // with no scene on the display yet, Weiter starts with the first
  const nextTitle = walk.at(activeIndex + 1)?.title;

  const statusText =
    showLoad.status === "loading"
      ? "Show wird geladen …"
      : showLoad.status === "error"
      ? showLoad.text
      : showLoad.status === "none"
      ? "Keine Show gewählt. Unter „Einstellungen“ den Schlüssel eintragen."
      : scenes.length === 0
      ? "Die Show hat keine Szenen."
      : null;

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col pt-safe-top-xs">
      <header className="flex items-center gap-3 px-4 py-3 text-xs uppercase tracking-[0.2em] text-neutral-400">
        {openGroup && (
          <button
            type="button"
            onClick={() => setOpenStoryId(null)}
            className="min-h-[44px] shrink-0 rounded-lg bg-neutral-800 px-3 text-sm normal-case tracking-normal text-neutral-200 active:bg-neutral-700"
          >
            ‹ Geschichten
          </button>
        )}
        <span className="min-w-0 flex-1 truncate tabular-nums">
          {openGroup
            ? activeScene
              ? `${openGroup.story.title} · Szene ${activeIndex + 1} / ${
                  walk.length
                }`
              : openGroup.story.title
            : showTitle}
        </span>
        <span className="flex items-center gap-2">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              CONNECTION_DOT[display.connection]
            }`}
          />
          {CONNECTION_LABEL[display.connection]}
          {code ? ` · ${code}` : ""}
        </span>
        <button
          type="button"
          onClick={() => setIsSettingsOpen(true)}
          aria-label="Einstellungen"
          className="min-h-[44px] min-w-[44px] rounded-lg bg-neutral-800 px-3 text-base normal-case tracking-normal text-neutral-200 active:bg-neutral-700"
        >
          ⋯
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

      <main className="flex flex-1 flex-col gap-8 px-4 pb-6 pt-4">
        {statusText ? (
          <p
            className={`m-0 text-lg ${
              showLoad.status === "error" ? "text-red-300" : "text-neutral-400"
            }`}
          >
            {statusText}
          </p>
        ) : openGroup ? (
          <>
            <div className="flex flex-col gap-3">
              {/* long press: the layer sliders */}
              <button
                type="button"
                {...titlePress}
                className="select-none bg-transparent p-0 text-left text-neutral-100 [-webkit-touch-callout:none]"
              >
                <span className="block text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">
                  {activeScene ? "Auf dem Modell" : "Bereit"}
                </span>
                <span className="mt-3 block break-words text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
                  {activeScene ? activeScene.title : openGroup.story.title}
                </span>
              </button>
              {activeScene?.text && (
                <p className="m-0 whitespace-pre-line text-base leading-relaxed text-neutral-300">
                  {activeScene.text}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={!target || !canGoBack}
                  onClick={() => step(-1)}
                  aria-label="Zurück"
                  className="min-h-[96px] rounded-2xl border border-neutral-700 bg-neutral-900 text-2xl active:bg-neutral-800 disabled:opacity-40"
                >
                  ‹
                </button>
                <button
                  type="button"
                  disabled={!target || !canGoOn}
                  onClick={() => step(1)}
                  aria-label="Weiter"
                  className="min-h-[96px] rounded-2xl bg-neutral-100 text-2xl text-neutral-950 active:bg-neutral-300 disabled:opacity-40"
                >
                  ›
                </button>
              </div>
              {nextTitle && (
                <p className="m-0 truncate text-sm text-neutral-400">
                  Als Nächstes: {nextTitle}
                </p>
              )}
            </div>

            {display.series && display.seriesClock && (
              <SeriesControl
                series={display.series}
                clock={display.seriesClock}
                disabled={!target}
                onPlay={display.setSeriesPlaying}
                onSeek={display.seekSeries}
              />
            )}
            {display.shadow && display.shadowClock && (
              <ShadowCard
                shadow={display.shadow}
                clock={display.shadowClock}
                disabled={!target}
                onPlay={display.setShadowPlay}
                onSeek={display.seekShadow}
                onCycle={display.setShadowCycle}
              />
            )}
            {walk.length === 0 ? (
              <p className="m-0 text-sm text-neutral-500">Keine Szenen.</p>
            ) : (
              <ol className="m-0 flex list-none flex-col gap-2 p-0">
                {walk.map((scene, index) => {
                  const isActive = scene.id === activeSceneId;
                  return (
                    <li key={scene.id}>
                      <button
                        type="button"
                        disabled={!target}
                        onClick={() => goToScene(scene)}
                        className={`flex min-h-[64px] w-full items-center gap-4 rounded-2xl px-4 text-left disabled:opacity-40 ${
                          isActive
                            ? "border border-amber-400 bg-amber-950 text-neutral-100"
                            : "bg-neutral-900 text-neutral-200 active:bg-neutral-800"
                        }`}
                      >
                        <span className="w-6 text-sm tabular-nums text-neutral-500">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="text-lg font-semibold leading-tight">
                          {scene.title}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </>
        ) : (
          <>
            <div className="flex flex-col gap-3">
              {/* tap: the live story, long press: the layer sliders */}
              <button
                type="button"
                {...titlePress}
                className="flex select-none flex-col rounded-2xl border border-neutral-800 bg-neutral-900 p-5 text-left text-neutral-100 [-webkit-touch-callout:none] active:bg-neutral-800"
              >
                <span className="block text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">
                  {activeScene ? "Auf dem Modell" : "Bereit"}
                </span>
                <span className="mt-3 block break-words text-4xl font-bold leading-tight tracking-tight">
                  {activeScene ? activeScene.title : showTitle}
                </span>
                {activeScene && liveGroup && (
                  <span className="mt-3 block text-xs uppercase tracking-[0.2em] text-neutral-400 tabular-nums">
                    {`${liveGroup.story.title} · Szene ${activeIndex + 1} / ${
                      walk.length
                    }`}
                  </span>
                )}
              </button>
              {/* the live scene's controls sit in its story, one tap away:
                  here they would push the stories off the screen */}
            </div>

            <ol className="m-0 grid list-none grid-cols-2 gap-3 p-0">
              {groups.map(({ story, scenes: storyScenes }, index) => {
                const isLive = story.id === liveGroup?.story.id;
                return (
                  <li key={story.id}>
                    <button
                      type="button"
                      onClick={() => setOpenStoryId(story.id)}
                      className={`flex min-h-[128px] w-full flex-col justify-between gap-4 rounded-2xl border p-4 text-left ${
                        isLive
                          ? "border-amber-400 bg-amber-950 text-neutral-100"
                          : "border-neutral-800 bg-neutral-900 text-neutral-200 active:bg-neutral-800"
                      }`}
                    >
                      <span className="text-sm tabular-nums text-neutral-500">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span>
                        <span className="block break-words text-lg font-semibold leading-tight">
                          {story.title}
                        </span>
                        <span className="mt-1 block text-sm text-neutral-400">
                          {storyScenes.length === 1
                            ? "1 Szene"
                            : `${storyScenes.length} Szenen`}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </main>

      {/* always in reach, whatever is open above it */}
      <nav className="sticky bottom-0 z-30 grid grid-cols-2 gap-3 border-t border-neutral-800 bg-neutral-950 px-4 pb-safe-bottom-xs pt-3">
        <button
          type="button"
          disabled={!live}
          onClick={() => setBlackout(!isBlackout)}
          className={`mb-3 min-h-[48px] w-full rounded-xl text-sm font-semibold uppercase tracking-widest disabled:opacity-40 ${
            isBlackout
              ? "bg-red-600 text-white active:bg-red-500"
              : "border border-neutral-700 bg-neutral-900 text-neutral-300 active:bg-neutral-800"
          }`}
        >
          {isBlackout ? "Blackout aus" : "Blackout"}
        </button>
        {/* the tap itself has to ask for motion access, iOS allows it only here */}
        <button
          type="button"
          disabled={!target || display.connection !== "connected"}
          onClick={pointer.open}
          className="mb-3 min-h-[48px] w-full rounded-xl border border-neutral-700 bg-neutral-900 text-sm font-semibold uppercase tracking-widest text-neutral-300 active:bg-neutral-800 disabled:opacity-40"
        >
          Zeiger
        </button>
      </nav>

      {pointer.status !== "closed" && <PointerPanel pointer={pointer} />}

      {sheet === "layers" && (
        <Sheet
          title={isChanging ? "Ebenen · Übergang läuft" : "Ebenen"}
          onClose={() => setSheet(null)}
        >
          {live && live.layers.length > 0 ? (
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
          ) : (
            <p className="m-0 text-neutral-400">
              Die Anzeige meldet noch keine Ebenen.
            </p>
          )}
        </Sheet>
      )}
    </div>
  );
};
