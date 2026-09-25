import { useMemo, useState } from "react";

import {
  Button,
  Checkbox,
  Input,
  Modal,
  Popconfirm,
  QRCode,
  Tooltip,
} from "antd";
import {
  faArrowDown,
  faArrowUp,
  faClapperboard,
  faCopy,
  faEye,
  faFloppyDisk,
  faLocationCrosshairs,
  faTrash,
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
  isBounds3857,
  newEditToken,
  newSceneId,
  publishShow,
  republishShow,
  showByteSize,
  type Bounds3857,
  type Show,
  type ShowScene,
} from "@carma-mapping/show-remote";

import { useAddonScope } from "../../lib/AddonStateContext";
import { routeScopeFromLocation } from "../../lib/addon-overrides-storage";
import type { AddonComponentProps } from "../../lib/registry";
import { OpenShowRow } from "./OpenShowRow";
import {
  SHOW_DRAFT_STORAGE_PREFIX,
  moveScene,
  useShowDraft,
  type ShowDraft,
} from "./show-draft";
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
  /** overrides the draft's per-route key */
  storageKey?: string;
  controlPosition?: Positions;
  controlOrder?: number;
};

const DEFAULT_CONTROL_POSITION: Positions = "topleft";
/** after the addon manager (90), see the order table in ADDON-UI.md */
const DEFAULT_CONTROL_ORDER = 95;

type Status = { kind: "busy" | "error" | "info"; text: string } | null;

const toShow = (draft: ShowDraft, publishedAt: string): Show => ({
  format: SHOW_FORMAT,
  version: SHOW_VERSION,
  title: draft.title.trim() || "Show",
  publishedAt,
  scenes: draft.scenes,
});

/**
 * A short hash of what a publish would store, so the modal can tell that the
 * phone's link no longer matches the list. Not for security, only for "changed".
 */
const fingerprintOf = (draft: ShowDraft): string => {
  const text = JSON.stringify([draft.title, draft.scenes]);
  let hash = 5381;
  for (let index = 0; index < text.length; index++) {
    hash = ((hash << 5) + hash + text.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(36);
};

const remoteLinkFor = (remoteUrl: string, key: string): string => {
  try {
    const url = new URL(remoteUrl);
    url.searchParams.set("show", key);
    return url.toString();
  } catch {
    return `${remoteUrl}?show=${encodeURIComponent(key)}`;
  }
};

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

const IconButton = ({
  title,
  icon,
  onClick,
  disabled,
  danger,
}: {
  title: string;
  icon: typeof faEye;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
}) => (
  <Tooltip title={title}>
    <Button
      size="small"
      type="text"
      danger={danger}
      disabled={disabled}
      onClick={onClick}
      icon={<FontAwesomeIcon icon={icon} />}
      aria-label={title}
    />
  </Tooltip>
);

const SceneRow = ({
  scene,
  index,
  count,
  onRename,
  onShow,
  onOverwrite,
  onMove,
  onDelete,
}: {
  scene: ShowScene;
  index: number;
  count: number;
  onRename: (title: string) => void;
  onShow: () => void;
  onOverwrite: () => void;
  onMove: (delta: number) => void;
  onDelete: () => void;
}) => (
  <li className="flex items-center gap-2 py-1">
    <span className="w-6 text-right tabular-nums text-gray-500">
      {index + 1}
    </span>
    <Input
      size="small"
      value={scene.title}
      onChange={(event) => onRename(event.target.value)}
      className="flex-1"
    />
    <span className="w-16 text-xs text-gray-500">
      {scene.config.layers.length}{" "}
      {scene.config.layers.length === 1 ? "Ebene" : "Ebenen"}
    </span>
    <span className="w-4 text-center text-gray-500">
      {scene.bounds && (
        <Tooltip title="Mit Position: die Anzeige fliegt zu diesem Ausschnitt">
          <FontAwesomeIcon icon={faLocationCrosshairs} />
        </Tooltip>
      )}
    </span>
    <IconButton title="Auf der Karte anzeigen" icon={faEye} onClick={onShow} />
    <Popconfirm
      title="Szene durch die aktuelle Karte ersetzen?"
      okText="Ersetzen"
      cancelText="Abbrechen"
      onConfirm={onOverwrite}
    >
      <IconButton title="Mit aktueller Karte überschreiben" icon={faFloppyDisk} />
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
    controlPosition = DEFAULT_CONTROL_POSITION,
    controlOrder = DEFAULT_CONTROL_ORDER,
  } = config;
  const scope = useAddonScope() ?? routeScopeFromLocation();
  const storageKey =
    config.storageKey || `${SHOW_DRAFT_STORAGE_PREFIX}::${scope}`;

  const [isOpen, setIsOpen] = useState(false);
  const [draft, updateDraft] = useShowDraft(storageKey);
  const [status, setStatus] = useState<Status>(null);
  const openShow = useOpenShow({
    readUrl,
    draft,
    updateDraft,
    fingerprintOf,
    onOpened: () => setStatus(null),
  });
  /** off by default: most scenes only change layers and leave the display where it is */
  const [withPosition, setWithPosition] = useState(false);

  const byteSize = useMemo(
    () => showByteSize(toShow(draft, new Date(0).toISOString())),
    [draft]
  );
  const isTooLarge = byteSize > MAX_SHOW_BYTES;
  const { published } = draft;
  const isPublishCurrent =
    published?.fingerprint !== undefined &&
    published.fingerprint === fingerprintOf(draft);
  const link =
    published && remoteUrl ? remoteLinkFor(remoteUrl, published.key) : null;
  const canPublish =
    draft.scenes.length > 0 && !isTooLarge && status?.kind !== "busy";

  const updateScene = (id: string, change: Partial<ShowScene>) =>
    updateDraft((current) => ({
      ...current,
      scenes: current.scenes.map((scene) =>
        scene.id === id ? { ...scene, ...change } : scene
      ),
    }));

  const currentMapConfig = () => {
    const mapConfig = carma.config.getMappingConfig();
    if (!mapConfig) {
      setStatus({
        kind: "error",
        text: "Die Karte liefert gerade keine Konfiguration.",
      });
    }
    return mapConfig;
  };

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

  const saveCurrentMap = () => {
    const scene = currentScene();
    if (!scene) {
      return;
    }
    setStatus(null);
    updateDraft((current) => ({
      ...current,
      scenes: [
        ...current.scenes,
        {
          id: newSceneId(),
          title: `Szene ${current.scenes.length + 1}`,
          ...scene,
        },
      ],
    }));
  };

  const overwriteScene = (id: string) => {
    const scene = currentScene();
    if (scene) {
      setStatus(null);
      updateScene(id, scene);
    }
  };

  const showScene = (scene: ShowScene) => {
    void carma.config.setMappingConfig(scene.config).then((applied) => {
      if (!applied) {
        setStatus({
          kind: "error",
          text: `„${scene.title}“ ließ sich nicht anzeigen.`,
        });
      }
    });
    if (scene.bounds) {
      const [minX, minY, maxX, maxY] = scene.bounds;
      const [minLng, minLat] = getFromWebMercatorToWGS84([minX, minY]);
      const [maxLng, maxLat] = getFromWebMercatorToWGS84([maxX, maxY]);
      carma.mapping2D.fitBounds(minLng, minLat, maxLng, maxLat, 0);
    }
  };

  /**
   * "reuse" replaces the show under the key the phone already has, so its link
   * stays; that needs the edit token of an earlier publish from this browser,
   * and without one it falls back to a new key. "new" always makes a new key.
   */
  const publish = async (mode: "reuse" | "new") => {
    const show = toShow(draft, new Date().toISOString());
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
        <Tooltip title="Show-Szenen" placement="right">
          <ControlButtonStyler
            onClick={() => setIsOpen(true)}
            dataTestId="show-scenes-control"
          >
            <FontAwesomeIcon icon={faClapperboard} />
          </ControlButtonStyler>
        </Tooltip>
      </Control>
      <Modal
        open={isOpen}
        onCancel={() => setIsOpen(false)}
        title="Show-Szenen"
        footer={null}
        width={640}
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="show-scenes-title" className="w-24 text-gray-600">
              Titel der Show
            </label>
            <Input
              id="show-scenes-title"
              value={draft.title}
              onChange={(event) => {
                const title = event.target.value;
                updateDraft((current) => ({ ...current, title }));
              }}
            />
          </div>

          <OpenShowRow {...openShow} />

          <div className="flex items-center gap-3">
            <Button type="primary" onClick={saveCurrentMap} className="flex-1">
              Aktuelle Karte als Szene speichern
            </Button>
            <Tooltip title="Speichert den aktuellen Kartenausschnitt mit, die Anzeige fliegt bei dieser Szene dorthin. Gilt auch fürs Überschreiben.">
              <Checkbox
                checked={withPosition}
                onChange={(event) => setWithPosition(event.target.checked)}
              >
                Position mitspeichern
              </Checkbox>
            </Tooltip>
          </div>

          {draft.scenes.length === 0 ? (
            <p className="m-0 text-gray-500">
              Noch keine Szene. Karte einrichten, dann hier speichern.
            </p>
          ) : (
            <ol className="m-0 list-none p-0">
              {draft.scenes.map((scene, index) => (
                <SceneRow
                  key={scene.id}
                  scene={scene}
                  index={index}
                  count={draft.scenes.length}
                  onRename={(title) => updateScene(scene.id, { title })}
                  onShow={() => showScene(scene)}
                  onOverwrite={() => overwriteScene(scene.id)}
                  onMove={(delta) =>
                    updateDraft((current) => ({
                      ...current,
                      scenes: moveScene(current.scenes, index, delta),
                    }))
                  }
                  onDelete={() =>
                    updateDraft((current) => ({
                      ...current,
                      scenes: current.scenes.filter(
                        ({ id }) => id !== scene.id
                      ),
                    }))
                  }
                />
              ))}
            </ol>
          )}

          <div className="flex items-center gap-3 border-0 border-t border-solid border-gray-200 pt-3">
            <span
              className={`text-xs ${
                isTooLarge ? "text-red-600" : "text-gray-500"
              }`}
            >
              {formatKb(byteSize)} von {formatKb(MAX_SHOW_BYTES)}
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
            <div className="flex gap-4 rounded bg-gray-50 p-3">
              {link && <QRCode value={link} size={132} bordered={false} />}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-gray-600">
                  Veröffentlicht{" "}
                  {new Date(published.at).toLocaleString("de-DE")} mit{" "}
                  {published.sceneCount}{" "}
                  {published.sceneCount === 1 ? "Szene" : "Szenen"}
                </span>
                {!isPublishCurrent && (
                  <span className="text-amber-700">
                    {published.editToken
                      ? "Die Liste wurde seitdem geändert. Nach dem nächsten Veröffentlichen sieht das Handy sie unter demselben Link."
                      : "Die Liste wurde seitdem geändert. Das nächste Veröffentlichen erzeugt einmalig einen neuen Link, danach bleibt er gleich."}
                  </span>
                )}
                <span className="text-xs text-gray-500">
                  Schlüssel: <code>{published.key}</code>
                </span>
                {link && (
                  <div className="flex items-center gap-1">
                    <a
                      href={link}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate text-xs"
                    >
                      {link}
                    </a>
                    <IconButton
                      title="Link kopieren"
                      icon={faCopy}
                      onClick={() => copyLink(link)}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
};
