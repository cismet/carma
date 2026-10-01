import {
  useEffect,
  useMemo,
  useState,
  type DragEvent,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import {
  Button,
  Checkbox,
  Input,
  Modal,
  Popconfirm,
  QRCode,
  Tag,
  Typography,
} from "antd";
import {
  faArrowDown,
  faArrowUp,
  faChevronDown,
  faChevronRight,
  faClapperboard,
  faCopy,
  faDisplay,
  faEye,
  faFloppyDisk,
  faLocationCrosshairs,
  faPlus,
  faTrash,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  getFromWGS84ToWebMercator,
  getFromWebMercatorToWGS84,
} from "@carma-geo/proj";
import {
  Control,
  ControlButtonStyler,
  type Positions,
} from "@carma-mapping/map-controls-layout";
import {
  DEFAULT_SHOW_READ_URL,
  DEFAULT_SHOW_STORE_URL,
  MAX_SHOW_BYTES,
  SHOW_FORMAT,
  SHOW_VERSION,
  ShowStoreError,
  baseLayersUnder,
  isBounds3857,
  layerTitle,
  newEditToken,
  newSceneId,
  publishShow,
  republishShow,
  storedShowByteSize,
  storyGroups,
  withStories,
  type Bounds3857,
  type Show,
  type ShowScene,
  type ShowStory,
} from "@carma-mapping/show-remote";
import type { MappingConfig, MappingConfigLayer } from "@carma-api";

import { useAddonScope } from "../../lib/AddonStateContext";
import { routeScopeFromLocation } from "../../lib/addon-overrides-storage";
import type { AddonComponentProps } from "../../lib/registry";
import { DraftFileRow } from "./DraftFileRow";
import { DraftInput } from "./DraftInput";
import { IconButton } from "./IconButton";
import { OpenShowRow } from "./OpenShowRow";
import { SceneDetails } from "./SceneDetails";
import {
  addStoryBaseLayers,
  applyExclusionToAll,
  copyLayerToScenes,
  deleteStory,
  hasBaseMapChoice,
  moveEntry,
  moveSceneInStory,
  moveSceneToStory,
  newStory,
  publishedScene,
  publishedStory,
  removeSceneLayer,
  removeStoryBaseLayer,
  sceneExclusion,
  setSceneLayerExcluded,
  storyBaseLayers,
  withBaseMapsAsLayers,
  withoutBaseLayers,
} from "./scene-edit";
import {
  SHOW_DRAFT_STORAGE_PREFIX,
  useShowDraft,
  useStoredCollapsedStories,
  useStoredPanelOpen,
  useStoredRelayCode,
  type ShowDraft,
} from "./show-draft";
import { useDraftFile } from "./useDraftFile";
import { useOpenShow } from "./useOpenShow";

/**
 * Putting a show together on the desktop: every scene is the map as it stands
 * when it is saved, and "Veröffentlichen" stores the whole list in ceepr for
 * the remote on the phone (`apps/pm-remote`). The display itself is not
 * touched; it only ever gets what the remote writes to the relay.
 */
export type ShowScenesConfig = {
  /** where a publish stores the show; defaults to the pm-show folder in ceepr */
  storeUrl?: string;
  /** where "Show öffnen" reads a published show; defaults to the same folder */
  readUrl?: string;
  /** the remote app the published link opens; without it only the key is shown */
  remoteUrl?: string;
  /**
   * The display page (`#/outlet`, without `relay`). With it the published row
   * opens the display for the relay code of the QR dialog.
   */
  outletUrl?: string;
  /** overrides the draft's per-route key */
  storageKey?: string;
  /**
   * Layers that help while putting the show together but never go to the
   * display, like the outline of the projection area: pre-ticked in a scene's
   * "Nicht in der Show" list until that scene's list is changed. Given as the
   * layer id or, for a layer added by its style, the style url. A scene keeps
   * them, so "Auf der Karte anzeigen" brings them back on the desktop; only
   * the published show goes without.
   */
  excludeLayers?: string[];
  controlPosition?: Positions;
  controlOrder?: number;
};

const DEFAULT_CONTROL_POSITION: Positions = "topleft";
/** after the addon manager (90), see the order table in ADDON-UI.md */
const DEFAULT_CONTROL_ORDER = 95;

/**
 * The open panel is a control of its own in the other corner, below the app
 * menu (10), so the map stays usable while the view for a scene is set up.
 */
const PANEL_POSITION: Positions = "topright";
const PANEL_ORDER = 20;

type Status = { kind: "busy" | "error" | "info"; text: string } | null;

/** a style url names the layer the catalog builds from it, `custom:<url>` */
const excludedIdsOf = (entries: string[]): Set<string> =>
  new Set(
    entries.map((entry) =>
      /^https?:\/\//.test(entry) ? `custom:${entry}` : entry
    )
  );

/**
 * `initial` is what a scene without its own "Nicht in der Show" list leaves
 * out; the stories' base layers go without it too.
 */
const toShow = (
  draft: ShowDraft,
  publishedAt: string,
  initial: readonly string[]
): Show => {
  const { stories, scenes } = withStories(draft);
  const excluded = new Set(initial);
  const published = stories.map((story) => publishedStory(story, excluded));
  const baseLayersOf = new Map(
    published.map(({ id, baseLayers }) => [id, baseLayers ?? []])
  );
  return {
    format: SHOW_FORMAT,
    version: SHOW_VERSION,
    title: draft.title.trim() || "Show",
    publishedAt,
    stories: published,
    scenes: scenes.map((scene) =>
      publishedScene(
        scene,
        sceneExclusion(draft, scene.id, initial),
        baseLayersOf.get(scene.story ?? "") ?? []
      )
    ),
  };
};

/**
 * A short hash of what a publish would store, so the panel can tell that the
 * phone's link no longer matches the list. Not for security, only for "changed".
 */
const fingerprintOf = (draft: ShowDraft): string => {
  // the lists only once they exist, so a publish from before them still matches
  const text = JSON.stringify([
    draft.title,
    ...(draft.stories ? [draft.stories] : []),
    draft.scenes,
    ...(draft.excludedLayerIds ? [draft.excludedLayerIds] : []),
    ...(draft.excludedLayerIdsByScene ? [draft.excludedLayerIdsByScene] : []),
  ]);
  let hash = 5381;
  for (let index = 0; index < text.length; index++) {
    hash = ((hash << 5) + hash + text.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(36);
};

/** what the relay accepts for a code a remote brings along */
const RELAY_CODE = /^[A-Za-z0-9_-]{4,32}$/;

/**
 * The remote with the show and, when given, the display's relay code: a phone
 * that never opened the remote drives nothing without one, and one that did
 * would drive the display it had last.
 */
const remoteLinkFor = (
  remoteUrl: string,
  key: string,
  relayCode: string | null
): string => {
  try {
    const url = new URL(remoteUrl);
    url.searchParams.set("show", key);
    if (relayCode) {
      url.searchParams.set("relay", relayCode);
    }
    return url.toString();
  } catch {
    const relay = relayCode ? `&relay=${encodeURIComponent(relayCode)}` : "";
    return `${remoteUrl}?show=${encodeURIComponent(key)}${relay}`;
  }
};

/** the outlet's parameters sit in the hash, so the url is extended as text */
const outletLinkFor = (outletUrl: string, relayCode: string): string =>
  `${outletUrl}${outletUrl.includes("?") ? "&" : "?"}relay=${encodeURIComponent(
    relayCode
  )}`;

const formatKb = (bytes: number): string =>
  `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} kB`;

type Wgs84Pair = Parameters<typeof getFromWGS84ToWebMercator>[0];

/** what either engine's `getBounds()` answers */
type ViewBounds = {
  getWest: () => number;
  getSouth: () => number;
  getEast: () => number;
  getNorth: () => number;
};

/** the visible map as an EPSG:3857 rectangle, the form the outlet flies to */
const toBounds3857 = (view: ViewBounds): Bounds3857 | null => {
  const [minX, minY] = getFromWGS84ToWebMercator([
    view.getWest(),
    view.getSouth(),
  ] as unknown as Wgs84Pair);
  const [maxX, maxY] = getFromWGS84ToWebMercator([
    view.getEast(),
    view.getNorth(),
  ] as unknown as Wgs84Pair);
  const bounds = [minX, minY, maxX, maxY];
  return isBounds3857(bounds) ? bounds : null;
};

/**
 * Where a dragged layer can be dropped: the handlers for the element, and
 * whether the layer is over it right now.
 */
type DropZone = {
  props: Pick<
    HTMLAttributes<HTMLElement>,
    "onDragOver" | "onDragLeave" | "onDrop"
  >;
  isOver: boolean;
};

const NO_DROP_ZONE: DropZone = { props: {}, isOver: false };

/** outline and tint only, so nothing moves under the pointer */
const dropZoneClass = ({ isOver }: DropZone) =>
  isOver ? "rounded bg-[#1677ff]/10 ring-1 ring-[#1677ff]" : "";

/** a layer being dragged, with the scene or story base it came from */
type DraggedLayer = {
  layer: MappingConfigLayer;
  sceneId?: string;
  baseOfStoryId?: string;
};

const SceneRow = ({
  scene,
  index,
  count,
  excludedIds,
  isExpanded,
  onToggle,
  onRename,
  onShow,
  onOverwrite,
  onMove,
  onDelete,
  drop,
  children,
}: {
  scene: ShowScene;
  index: number;
  count: number;
  excludedIds: ReadonlySet<string>;
  isExpanded: boolean;
  onToggle: () => void;
  onRename: (title: string) => void;
  onShow: () => void;
  onOverwrite: () => void;
  onMove: (delta: number) => void;
  onDelete: () => void;
  /** a layer dropped on the row goes into the scene */
  drop: DropZone;
  /** the details, shown under the row while it is expanded */
  children?: ReactNode;
}) => {
  const excluded = scene.config.layers.filter(({ id }) => excludedIds.has(id));
  // what the display gets; the excluded ones only stay on the desktop
  const shown = scene.config.layers.length - excluded.length;
  return (
    <li className={`py-1 ${dropZoneClass(drop)}`} {...drop.props}>
      <div className="flex items-center gap-2">
        <IconButton
          title={isExpanded ? "Details schließen" : "Text und Ebenen"}
          icon={isExpanded ? faChevronDown : faChevronRight}
          onClick={onToggle}
        />
        <span className="w-6 text-right tabular-nums text-gray-500">
          {index + 1}
        </span>
        <DraftInput
          size="small"
          value={scene.title}
          onValue={onRename}
          className="flex-1"
        />
        <span className="w-20 whitespace-nowrap text-xs text-gray-500">
          {shown} {shown === 1 ? "Ebene" : "Ebenen"}
          {excluded.length > 0 && (
            <span className="ml-1 text-gray-400">+{excluded.length}</span>
          )}
        </span>
        <span className="w-4 text-center text-gray-500">
          {scene.bounds && <FontAwesomeIcon icon={faLocationCrosshairs} />}
        </span>
        <IconButton
          title="Auf der Karte anzeigen"
          icon={faEye}
          onClick={onShow}
        />
        <Popconfirm
          title="Szene durch die aktuelle Karte ersetzen?"
          okText="Ersetzen"
          cancelText="Abbrechen"
          onConfirm={onOverwrite}
        >
          <IconButton
            title="Mit aktueller Karte überschreiben"
            icon={faFloppyDisk}
          />
        </Popconfirm>
        <IconButton
          title="Nach oben"
          icon={faArrowUp}
          disabled={index === 0}
          onClick={() => onMove(-1)}
        />
        <IconButton
          title="Nach unten"
          icon={faArrowDown}
          disabled={index === count - 1}
          onClick={() => onMove(1)}
        />
        <Popconfirm
          title="Szene löschen?"
          okText="Löschen"
          okButtonProps={{ danger: true }}
          cancelText="Abbrechen"
          onConfirm={onDelete}
        >
          <IconButton title="Löschen" icon={faTrash} danger />
        </Popconfirm>
      </div>
      {isExpanded && children}
    </li>
  );
};

const StoryBlock = ({
  story,
  index,
  count,
  sceneCount,
  isCollapsed,
  onToggle,
  onRename,
  onMove,
  onDelete,
  onSave,
  onAddBaseLayersFromMap,
  onRemoveBaseLayer,
  onBaseLayerDragStart,
  onLayerDragEnd,
  headerDrop,
  baseDrop,
  children,
}: {
  story: ShowStory;
  index: number;
  count: number;
  sceneCount: number;
  /** only the header row, without the base layers, scenes and save button */
  isCollapsed: boolean;
  onToggle: () => void;
  onRename: (title: string) => void;
  onMove: (delta: number) => void;
  onDelete: () => void;
  /** the current map as a new scene of this story */
  onSave: () => void;
  /** the current map's layers into the story's base */
  onAddBaseLayersFromMap: () => void;
  onRemoveBaseLayer: (layerId: string) => void;
  onBaseLayerDragStart: (layer: MappingConfigLayer, event: DragEvent) => void;
  onLayerDragEnd: () => void;
  /** a layer dropped on the header row goes into every scene of the story */
  headerDrop: DropZone;
  /** one dropped on the base line becomes a base layer */
  baseDrop: DropZone;
  children?: ReactNode;
}) => (
  <li className="flex flex-col gap-1 rounded border border-solid border-gray-200 p-2">
    <div
      className={`flex items-center gap-2 ${dropZoneClass(headerDrop)}`}
      {...headerDrop.props}
    >
      <IconButton
        title={isCollapsed ? "Geschichte aufklappen" : "Geschichte zuklappen"}
        icon={isCollapsed ? faChevronRight : faChevronDown}
        onClick={onToggle}
      />
      <DraftInput
        size="small"
        value={story.title}
        onValue={onRename}
        className="flex-1 font-semibold"
      />
      <span className="whitespace-nowrap text-xs text-gray-500">
        {sceneCount} {sceneCount === 1 ? "Szene" : "Szenen"}
      </span>
      <IconButton
        title="Geschichte nach oben"
        icon={faArrowUp}
        disabled={index === 0}
        onClick={() => onMove(-1)}
      />
      <IconButton
        title="Geschichte nach unten"
        icon={faArrowDown}
        disabled={index === count - 1}
        onClick={() => onMove(1)}
      />
      <Popconfirm
        title={
          sceneCount > 0
            ? `Geschichte mit ${sceneCount} ${
                sceneCount === 1 ? "Szene" : "Szenen"
              } löschen?`
            : "Geschichte löschen?"
        }
        okText="Löschen"
        okButtonProps={{ danger: true }}
        cancelText="Abbrechen"
        onConfirm={onDelete}
        disabled={count === 1}
      >
        <IconButton
          title={
            count === 1 ? "Die einzige Geschichte bleibt" : "Geschichte löschen"
          }
          icon={faTrash}
          danger
          disabled={count === 1}
        />
      </Popconfirm>
    </div>
    {!isCollapsed && (
      <>
        <div
          className={`flex flex-wrap items-center gap-1 ${dropZoneClass(
            baseDrop
          )}`}
          {...baseDrop.props}
        >
          <span className="text-xs font-semibold text-gray-600">
            Basisebenen
          </span>
          {story.baseLayers?.length ? (
            story.baseLayers.map((layer) => (
              <Tag
                key={layer.id}
                draggable
                onDragStart={(event) => onBaseLayerDragStart(layer, event)}
                onDragEnd={onLayerDragEnd}
                closable
                onClose={(event) => {
                  // the list is the draft's; the tag goes with its entry
                  event.preventDefault();
                  onRemoveBaseLayer(layer.id);
                }}
                style={{ marginInlineEnd: 0, cursor: "grab" }}
              >
                {layerTitle(layer)}
              </Tag>
            ))
          ) : (
            <span className="text-xs text-gray-500">
              Keine. Basisebenen liegen unter jeder Szene der Geschichte.
            </span>
          )}
          <Popconfirm
            title="Ebenen der aktuellen Karte als Basisebenen übernehmen?"
            description="Jede Szene dieser Geschichte liegt dann auf ihnen. Ebenen, die nie in die Show gehen, bleiben draußen."
            okText="Übernehmen"
            cancelText="Abbrechen"
            onConfirm={onAddBaseLayersFromMap}
          >
            <IconButton title="Aktuelle Karte als Basisebenen" icon={faPlus} />
          </Popconfirm>
        </div>
        {sceneCount === 0 ? (
          <p className="m-0 text-xs text-gray-500">
            Noch keine Szene. Karte einrichten, dann hier speichern.
          </p>
        ) : (
          children
        )}
        <Button
          size="small"
          type="dashed"
          icon={<FontAwesomeIcon icon={faPlus} />}
          onClick={onSave}
          className="self-start"
        >
          Aktuelle Karte als Szene speichern
        </Button>
      </>
    )}
  </li>
);

export const ShowScenes = ({
  config = {},
  carma,
  libreMap,
  leafletMap,
}: AddonComponentProps<"showScenes">) => {
  const {
    storeUrl = DEFAULT_SHOW_STORE_URL,
    readUrl = DEFAULT_SHOW_READ_URL,
    remoteUrl,
    outletUrl,
    excludeLayers,
    controlPosition = DEFAULT_CONTROL_POSITION,
    controlOrder = DEFAULT_CONTROL_ORDER,
  } = config;
  const scope = useAddonScope() ?? routeScopeFromLocation();
  const storageKey =
    config.storageKey || `${SHOW_DRAFT_STORAGE_PREFIX}::${scope}`;

  const [isOpen, setIsOpen] = useStoredPanelOpen(storageKey);
  /**
   * Here and not in the panel: `Control` registers its children anew on every
   * render. The same goes for the one expanded scene row.
   */
  const [isQrOpen, setIsQrOpen] = useState(false);
  const [expandedSceneId, setExpandedSceneId] = useState<string | null>(null);
  const [collapsedStoryIds, setCollapsedStoryIds] =
    useStoredCollapsedStories(storageKey);
  const [dragged, setDragged] = useState<DraggedLayer | null>(null);
  /** the drop zone under the dragged layer, by its key */
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [draft, updateDraft] = useShowDraft(storageKey);
  const [relayCode, setRelayCode] = useStoredRelayCode(storageKey);
  const [status, setStatus] = useState<Status>(null);
  const openShow = useOpenShow({
    readUrl,
    draft,
    updateDraft,
    fingerprintOf,
    onOpened: () => {
      setStatus(null);
      setExpandedSceneId(null);
    },
  });
  const draftFile = useDraftFile({
    draft,
    updateDraft,
    onLoaded: () => {
      setStatus(null);
      setExpandedSceneId(null);
    },
  });
  /** off by default: most scenes only change layers and leave the display where it is */
  const [withPosition, setWithPosition] = useState(false);

  /** the config's list is where every scene starts */
  const defaultExcludedIds = useMemo(
    () => [...excludedIdsOf(excludeLayers ?? [])],
    [excludeLayers]
  );
  /** the show-wide list of older drafts still wins over the config's */
  const initialExcludedOf = (current: ShowDraft): readonly string[] =>
    current.excludedLayerIds ?? defaultExcludedIds;
  const initialExcluded = initialExcludedOf(draft);

  /** what a publish sends, packed; null until it is worked out */
  const [byteSize, setByteSize] = useState<number | null>(null);
  useEffect(() => {
    let isCurrent = true;
    storedShowByteSize(
      toShow(
        draft,
        new Date(0).toISOString(),
        draft.excludedLayerIds ?? defaultExcludedIds
      )
    ).then(
      (size) => {
        if (isCurrent) {
          setByteSize(size);
        }
      },
      (error: unknown) => {
        console.warn("[SHOW SCENES] measuring the show failed", error);
      }
    );
    return () => {
      isCurrent = false;
    };
  }, [draft, defaultExcludedIds]);
  const isTooLarge = byteSize !== null && byteSize > MAX_SHOW_BYTES;
  const groups = useMemo(() => storyGroups(draft), [draft]);
  const { published } = draft;
  const isPublishCurrent =
    published?.fingerprint !== undefined &&
    published.fingerprint === fingerprintOf(draft);
  const trimmedRelayCode = relayCode.trim();
  const isRelayCodeValid = RELAY_CODE.test(trimmedRelayCode);
  const link =
    published && remoteUrl
      ? remoteLinkFor(
          remoteUrl,
          published.key,
          isRelayCodeValid ? trimmedRelayCode : null
        )
      : null;
  const canPublish =
    draft.scenes.length > 0 && !isTooLarge && status?.kind !== "busy";

  const updateScene = (id: string, change: Partial<ShowScene>) =>
    updateDraft((current) => ({
      ...current,
      scenes: current.scenes.map((scene) =>
        scene.id === id ? { ...scene, ...change } : scene
      ),
    }));

  /**
   * The map as it stands, its base map as the lowest of its layers: listed
   * with the others, and the display draws it whatever base maps it has.
   */
  const currentMapConfig = () => {
    const mapConfig = carma.config.getMappingConfig();
    if (!mapConfig) {
      setStatus({
        kind: "error",
        text: "Die Karte liefert gerade keine Konfiguration.",
      });
      return null;
    }
    return carma.config.backgroundAsLayers(mapConfig);
  };

  // scenes saved before the base map went into their layers get it there too
  useEffect(() => {
    if (draft.scenes.some(({ config }) => hasBaseMapChoice(config))) {
      updateDraft((current) =>
        withBaseMapsAsLayers(current, carma.config.backgroundAsLayers)
      );
    }
  }, [draft, updateDraft, carma]);

  /**
   * What a save stores: the map, and its visible rectangle when the tick is
   * set. Null when the tick is set but the map has no rectangle to give.
   */
  const currentScene = (): Pick<ShowScene, "config" | "bounds"> | null => {
    const mapConfig = currentMapConfig();
    if (!mapConfig) {
      return null;
    }
    if (!withPosition) {
      return { config: mapConfig, bounds: undefined };
    }
    const view = libreMap?.getBounds() ?? leafletMap?.getBounds();
    const bounds = view ? toBounds3857(view) : null;
    if (!bounds) {
      setStatus({
        kind: "error",
        text: "Die Karte liefert gerade keinen Ausschnitt.",
      });
      return null;
    }
    return { config: mapConfig, bounds };
  };

  /** the current map as the last scene of the story */
  const saveCurrentMap = (storyId: string) => {
    const scene = currentScene();
    if (!scene) {
      return;
    }
    setStatus(null);
    updateDraft((current) => {
      const count = current.scenes.filter(
        ({ story }) => story === storyId
      ).length;
      return {
        ...current,
        scenes: [
          ...current.scenes,
          {
            id: newSceneId(),
            title: `Szene ${count + 1}`,
            story: storyId,
            ...scene,
            config: withoutBaseLayers(
              scene.config,
              storyBaseLayers(current, storyId)
            ),
          },
        ],
      };
    });
  };

  const addStory = () =>
    updateDraft((current) => {
      const { stories } = withStories(current);
      return {
        ...withStories(current),
        stories: [...stories, newStory(stories.length + 1)],
      };
    });

  const updateStories = (change: (stories: ShowStory[]) => ShowStory[]) =>
    updateDraft((current) => {
      const shaped = withStories(current);
      return { ...shaped, stories: change(shaped.stories) };
    });

  const setStoryCollapsed = (storyId: string, isCollapsed: boolean) =>
    setCollapsedStoryIds((ids) => {
      if (ids.has(storyId) === isCollapsed) {
        return ids;
      }
      const next = new Set(ids);
      if (isCollapsed) {
        next.add(storyId);
      } else {
        next.delete(storyId);
      }
      return next;
    });

  /** an open scene closes with its story */
  const toggleStory = (storyId: string, scenes: ShowScene[]) => {
    const isCollapsing = !collapsedStoryIds.has(storyId);
    setStoryCollapsed(storyId, isCollapsing);
    if (isCollapsing && scenes.some(({ id }) => id === expandedSceneId)) {
      setExpandedSceneId(null);
    }
  };

  /** the story's base layers stay out of the scene, see `saveCurrentMap` */
  const overwriteScene = (id: string) => {
    const scene = currentScene();
    if (!scene) {
      return;
    }
    setStatus(null);
    updateDraft((current) => ({
      ...current,
      scenes: current.scenes.map((entry) =>
        entry.id === id
          ? {
              ...entry,
              ...scene,
              config: withoutBaseLayers(
                scene.config,
                storyBaseLayers(current, entry.story)
              ),
            }
          : entry
      ),
    }));
  };

  const storyName = (story: ShowStory) => story.title || "(ohne Titel)";

  /** the map's layers, but those the show never gets, as the story's base */
  const addBaseLayersFromMap = (story: ShowStory) => {
    const mapConfig = currentMapConfig();
    if (!mapConfig) {
      return;
    }
    const excluded = new Set(initialExcluded);
    const layers = mapConfig.layers.filter(({ id }) => !excluded.has(id));
    if (layers.length === 0) {
      setStatus({
        kind: "info",
        text: `Auf der Karte ist keine Ebene für die Basis von „${storyName(
          story
        )}“.`,
      });
      return;
    }
    updateDraft((current) => addStoryBaseLayers(current, story.id, layers));
    setStatus({
      kind: "info",
      text: `Basis von „${storyName(story)}“: ${layers
        .map(layerTitle)
        .join(", ")}.`,
    });
  };

  const startLayerDrag = (from: DraggedLayer, event: DragEvent) => {
    // Firefox starts a drag only with some data set
    event.dataTransfer.setData("text/plain", layerTitle(from.layer));
    event.dataTransfer.effectAllowed = "copy";
    setDragged(from);
  };

  const endLayerDrag = () => {
    setDragged(null);
    setDropTarget(null);
  };

  /** none while nothing is dragged, and none where the layer came from */
  const dropZone = (
    key: string,
    isSource: boolean,
    onDrop: (layer: MappingConfigLayer) => void
  ): DropZone => {
    if (!dragged || isSource) {
      return NO_DROP_ZONE;
    }
    const { layer } = dragged;
    return {
      isOver: dropTarget === key,
      props: {
        onDragOver: (event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          setDropTarget(key);
        },
        onDragLeave: () =>
          setDropTarget((current) => (current === key ? null : current)),
        onDrop: (event) => {
          event.preventDefault();
          endLayerDrag();
          onDrop(layer);
        },
      },
    };
  };

  const copyIntoScenes = (layer: MappingConfigLayer, sceneIds: string[]) => {
    const ids = new Set(sceneIds);
    const { count } = copyLayerToScenes(draft, layer, ids);
    updateDraft((current) => copyLayerToScenes(current, layer, ids).draft);
    return count;
  };

  const dropOnScene = (layer: MappingConfigLayer, scene: ShowScene) => {
    const title = layerTitle(layer);
    const count = copyIntoScenes(layer, [scene.id]);
    setStatus({
      kind: "info",
      text:
        count === 0
          ? `„${scene.title}“ hat „${title}“ schon.`
          : `„${title}“ in „${scene.title}“ kopiert.`,
    });
  };

  const dropOnStory = (
    layer: MappingConfigLayer,
    story: ShowStory,
    scenes: ShowScene[]
  ) => {
    const title = layerTitle(layer);
    const name = storyName(story);
    const count = copyIntoScenes(
      layer,
      scenes.map(({ id }) => id)
    );
    setStatus({
      kind: "info",
      text:
        scenes.length === 0
          ? `„${name}“ hat noch keine Szene.`
          : count === 0
          ? `Jede Szene von „${name}“ hat „${title}“ schon.`
          : `„${title}“ in ${count} ${
              count === 1 ? "Szene" : "Szenen"
            } von „${name}“ kopiert.`,
    });
  };

  const dropOnBase = (layer: MappingConfigLayer, story: ShowStory) => {
    updateDraft((current) => addStoryBaseLayers(current, story.id, [layer]));
    setStatus({
      kind: "info",
      text: `„${layerTitle(layer)}“ ist Basisebene von „${storyName(story)}“.`,
    });
  };

  const deleteScene = (id: string) =>
    updateDraft((current) => {
      const byScene = current.excludedLayerIdsByScene;
      return {
        ...current,
        scenes: current.scenes.filter((scene) => scene.id !== id),
        ...(byScene
          ? {
              excludedLayerIdsByScene: Object.fromEntries(
                Object.entries(byScene).filter(([sceneId]) => sceneId !== id)
              ),
            }
          : {}),
      };
    });

  const showMap = (
    mapConfig: MappingConfig,
    bounds: Bounds3857 | undefined,
    label: string
  ) => {
    void carma.config.setMappingConfig(mapConfig).then((applied) => {
      if (!applied) {
        setStatus({
          kind: "error",
          text: `„${label}“ ließ sich nicht anzeigen.`,
        });
      }
    });
    if (bounds) {
      const [minX, minY, maxX, maxY] = bounds;
      const [minLng, minLat] = getFromWebMercatorToWGS84([minX, minY]);
      const [maxLng, maxLat] = getFromWebMercatorToWGS84([maxX, maxY]);
      carma.mapping2D.fitBounds(minLng, minLat, maxLng, maxLat, 0);
    }
  };

  /** the scene on its story's base layers, as the display shows it */
  const showScene = (scene: ShowScene, story: ShowStory) =>
    showMap(
      baseLayersUnder(scene.config, story.baseLayers),
      scene.bounds,
      scene.title
    );

  /**
   * "reuse" replaces the show under the key the phone already has, so its link
   * stays; that needs the edit token of an earlier publish from this browser,
   * and without one it falls back to a new key. "new" always makes a new key.
   */
  const publish = async (mode: "reuse" | "new") => {
    const show = toShow(draft, new Date().toISOString(), initialExcluded);
    // taken now: an edit made while the request runs is not in this publish
    const fingerprint = fingerprintOf(draft);
    const reuse =
      mode === "reuse" && published?.editToken
        ? { key: published.key, editToken: published.editToken }
        : null;
    setStatus({ kind: "busy", text: "Wird veröffentlicht …" });
    try {
      let key: string;
      let editToken: string;
      if (reuse) {
        await republishShow(storeUrl, reuse.key, show, reuse.editToken);
        ({ key, editToken } = reuse);
      } else {
        editToken = newEditToken();
        key = await publishShow(storeUrl, show, editToken);
      }
      updateDraft((current) => ({
        ...current,
        published: {
          key,
          at: show.publishedAt,
          sceneCount: show.scenes.length,
          fingerprint,
          editToken,
        },
      }));
      setStatus(null);
    } catch (error) {
      const cannotReplace =
        reuse !== null &&
        error instanceof ShowStoreError &&
        (error.status === 403 || error.status === 404);
      setStatus({
        kind: "error",
        text: cannotReplace
          ? "Der bisherige Link lässt sich nicht aktualisieren. „Neuer Link“ veröffentlicht unter einem neuen."
          : `Veröffentlichen fehlgeschlagen (${
              error instanceof Error ? error.message : String(error)
            }).`,
      });
    }
  };

  /** without a code there is no display to open; the QR dialog asks for it */
  const openOutlet = (url: string) => {
    if (!isRelayCodeValid) {
      setStatus({
        kind: "info",
        text: "Für das Outlet fehlt der Relay-Code, er steht im QR-Dialog.",
      });
      setIsQrOpen(true);
      return;
    }
    window.open(outletLinkFor(url, trimmedRelayCode), "_blank", "noopener");
  };

  const copyLink = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => setStatus({ kind: "info", text: "Link kopiert." }),
      () =>
        setStatus({
          kind: "error",
          text: "Kopieren ging nicht, der Link steht unten zum Markieren.",
        })
    );
  };

  return (
    <>
      <Control position={controlPosition} order={controlOrder}>
        <ControlButtonStyler
          onClick={() => setIsOpen((open) => !open)}
          dataTestId="show-scenes-control"
        >
          <FontAwesomeIcon
            icon={faClapperboard}
            style={isOpen ? { color: "#1677ff" } : undefined}
          />
        </ControlButtonStyler>
      </Control>
      {isOpen && (
        <Control position={PANEL_POSITION} order={PANEL_ORDER}>
          <div
            className="flex w-[520px] flex-col gap-3 overflow-y-auto rounded-md bg-white p-4 shadow-lg"
            style={{ maxHeight: "calc(100svh - 120px)" }}
            data-test-id="show-scenes-panel"
          >
            <div className="flex items-center">
              <span className="flex-1 text-base font-semibold">
                Show-Szenen
              </span>
              {published && (
                <span className="mr-2 font-mono text-xs text-gray-400">
                  {published.key}
                </span>
              )}
              <IconButton
                title="Schließen"
                icon={faXmark}
                onClick={() => setIsOpen(false)}
              />
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="show-scenes-title" className="w-24 text-gray-600">
                Titel der Show
              </label>
              <DraftInput
                id="show-scenes-title"
                value={draft.title}
                onValue={(title) =>
                  updateDraft((current) => ({ ...current, title }))
                }
              />
            </div>

            <OpenShowRow {...openShow} />
            <DraftFileRow {...draftFile} />

            <div className="flex items-center gap-3">
              <span className="flex-1 text-xs text-gray-500">
                Geschichten sind Ordner mit Szenen. Auf dem Handy blättern ‹ ›
                innerhalb der Geschichte.
              </span>
              <Checkbox
                checked={withPosition}
                onChange={(event) => setWithPosition(event.target.checked)}
              >
                Position mitspeichern
              </Checkbox>
            </div>

            <ol className="m-0 flex list-none flex-col gap-2 p-0">
              {groups.map(({ story, scenes: storyScenes }, storyIndex) => (
                <StoryBlock
                  key={story.id}
                  story={story}
                  index={storyIndex}
                  count={groups.length}
                  sceneCount={storyScenes.length}
                  isCollapsed={collapsedStoryIds.has(story.id)}
                  onToggle={() => toggleStory(story.id, storyScenes)}
                  onRename={(title) =>
                    updateStories((stories) =>
                      stories.map((entry) =>
                        entry.id === story.id ? { ...entry, title } : entry
                      )
                    )
                  }
                  onMove={(delta) =>
                    updateStories((stories) =>
                      moveEntry(stories, storyIndex, delta)
                    )
                  }
                  onDelete={() =>
                    updateDraft((current) => deleteStory(current, story.id))
                  }
                  onSave={() => saveCurrentMap(story.id)}
                  onAddBaseLayersFromMap={() => addBaseLayersFromMap(story)}
                  onRemoveBaseLayer={(layerId) =>
                    updateDraft((current) =>
                      removeStoryBaseLayer(current, story.id, layerId)
                    )
                  }
                  onBaseLayerDragStart={(layer, event) =>
                    startLayerDrag({ layer, baseOfStoryId: story.id }, event)
                  }
                  onLayerDragEnd={endLayerDrag}
                  headerDrop={dropZone(`story:${story.id}`, false, (layer) =>
                    dropOnStory(layer, story, storyScenes)
                  )}
                  baseDrop={dropZone(
                    `base:${story.id}`,
                    dragged?.baseOfStoryId === story.id,
                    (layer) => dropOnBase(layer, story)
                  )}
                >
                  <ol className="m-0 list-none p-0">
                    {storyScenes.map((scene, index) => {
                      const excludedIds = sceneExclusion(
                        draft,
                        scene.id,
                        initialExcluded
                      );
                      return (
                        <SceneRow
                          key={scene.id}
                          scene={scene}
                          index={index}
                          count={storyScenes.length}
                          excludedIds={excludedIds}
                          isExpanded={expandedSceneId === scene.id}
                          onToggle={() =>
                            setExpandedSceneId((id) =>
                              id === scene.id ? null : scene.id
                            )
                          }
                          onRename={(title) => updateScene(scene.id, { title })}
                          onShow={() => showScene(scene, story)}
                          onOverwrite={() => overwriteScene(scene.id)}
                          onMove={(delta) =>
                            updateDraft((current) => ({
                              ...current,
                              scenes: moveSceneInStory(
                                current.scenes,
                                scene.id,
                                delta
                              ),
                            }))
                          }
                          onDelete={() => deleteScene(scene.id)}
                          drop={dropZone(
                            `scene:${scene.id}`,
                            dragged?.sceneId === scene.id,
                            (layer) => dropOnScene(layer, scene)
                          )}
                        >
                          <SceneDetails
                            scene={scene}
                            excluded={excludedIds}
                            canApplyToAll={draft.scenes.length > 1}
                            stories={groups.map(({ story }) => story)}
                            onStory={(storyId) => {
                              // the scene stays open, so its new story opens too
                              setStoryCollapsed(storyId, false);
                              updateDraft((current) => ({
                                ...current,
                                scenes: moveSceneToStory(
                                  current.scenes,
                                  scene.id,
                                  storyId
                                ),
                              }));
                            }}
                            onText={(text) => updateScene(scene.id, { text })}
                            onLayerDragStart={(layer, event) =>
                              startLayerDrag(
                                { layer, sceneId: scene.id },
                                event
                              )
                            }
                            onLayerDragEnd={endLayerDrag}
                            onExclude={(layerId, excluded) =>
                              updateDraft((current) =>
                                setSceneLayerExcluded(
                                  current,
                                  scene.id,
                                  layerId,
                                  excluded,
                                  initialExcludedOf(current)
                                )
                              )
                            }
                            onExclusionToAll={() =>
                              updateDraft((current) =>
                                applyExclusionToAll(
                                  current,
                                  scene.id,
                                  initialExcludedOf(current)
                                )
                              )
                            }
                            onRemoveLayer={(layerId) =>
                              updateDraft((current) =>
                                removeSceneLayer(current, scene.id, layerId)
                              )
                            }
                          />
                        </SceneRow>
                      );
                    })}
                  </ol>
                </StoryBlock>
              ))}
            </ol>
            <Button
              icon={<FontAwesomeIcon icon={faPlus} />}
              onClick={addStory}
              className="self-start"
            >
              Neue Geschichte
            </Button>

            <div className="flex items-center gap-3 border-0 border-t border-solid border-gray-200 pt-3">
              <span
                className={`text-xs ${
                  isTooLarge ? "text-red-600" : "text-gray-500"
                }`}
              >
                {byteSize === null ? "…" : formatKb(byteSize)} von{" "}
                {formatKb(MAX_SHOW_BYTES)}
              </span>
              <div className="flex-1" />
              {published && (
                <Popconfirm
                  title="Unter einem neuen Link veröffentlichen?"
                  description="Handys mit dem bisherigen Link bekommen danach keine Änderungen mehr."
                  okText="Neuer Link"
                  cancelText="Abbrechen"
                  onConfirm={() => void publish("new")}
                  disabled={!canPublish}
                >
                  <Button disabled={!canPublish}>Neuer Link</Button>
                </Popconfirm>
              )}
              <Button
                onClick={() => void publish("reuse")}
                disabled={!canPublish}
                loading={status?.kind === "busy"}
              >
                Veröffentlichen
              </Button>
            </div>

            {status && (
              <p
                className={`m-0 ${
                  status.kind === "error" ? "text-red-600" : "text-gray-600"
                }`}
              >
                {status.text}
              </p>
            )}

            {published && (
              <div className="flex items-center gap-1.5 whitespace-nowrap rounded bg-gray-50 px-3 py-1 text-xs text-gray-600">
                <span>
                  Veröffentlicht{" "}
                  {new Date(published.at).toLocaleString("de-DE", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </span>
                <span className="text-gray-400">·</span>
                <span>
                  {published.sceneCount}{" "}
                  {published.sceneCount === 1 ? "Szene" : "Szenen"}
                </span>
                {!isPublishCurrent && (
                  <span className="text-amber-700">geändert</span>
                )}
                <span className="text-gray-400">·</span>
                {link ? (
                  <>
                    <a
                      href={link}
                      onClick={(event) => {
                        event.preventDefault();
                        setIsQrOpen(true);
                      }}
                      className="min-w-0 flex-1 truncate"
                    >
                      {link}
                    </a>
                    <IconButton
                      title="Link kopieren"
                      icon={faCopy}
                      onClick={() => copyLink(link)}
                    />
                  </>
                ) : (
                  <span className="min-w-0 flex-1 truncate">
                    Schlüssel <code>{published.key}</code>
                  </span>
                )}
                {outletUrl && (
                  <IconButton
                    title="Outlet öffnen"
                    icon={faDisplay}
                    onClick={() => openOutlet(outletUrl)}
                  />
                )}
              </div>
            )}
          </div>
        </Control>
      )}
      <Modal
        open={isQrOpen && link !== null}
        onCancel={() => setIsQrOpen(false)}
        footer={null}
        centered
        width={360}
        title="Show auf dem Handy öffnen"
      >
        {link && (
          <div className="flex flex-col items-center gap-3">
            <label className="flex w-full flex-col gap-1 text-xs text-gray-600">
              Relay-Code der Anzeige
              <Input
                size="small"
                allowClear
                value={relayCode}
                onChange={(event) => setRelayCode(event.target.value)}
                placeholder="relay= aus der Outlet-Adresse"
                status={
                  trimmedRelayCode && !isRelayCodeValid ? "error" : undefined
                }
              />
              {trimmedRelayCode && !isRelayCodeValid ? (
                <span className="text-red-600">
                  4 bis 32 Zeichen aus A-Z, 0-9, _ und -; so nicht im Link
                </span>
              ) : !trimmedRelayCode ? (
                <span>
                  Leer: das Handy steuert die Anzeige, die es zuletzt hatte
                </span>
              ) : null}
            </label>
            <QRCode value={link} size={256} bordered={false} />
            <Typography.Link
              href={link}
              target="_blank"
              rel="noreferrer"
              copyable={{ text: link, tooltips: ["Link kopieren", "Kopiert"] }}
              className="break-all text-center text-xs"
            >
              {link}
            </Typography.Link>
          </div>
        )}
      </Modal>
    </>
  );
};
