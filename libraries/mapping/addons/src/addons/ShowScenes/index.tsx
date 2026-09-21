import { useMemo, useState } from "react";

import { Button, Input, Modal, Popconfirm, QRCode, Tooltip } from "antd";
import {
  faArrowDown,
  faArrowUp,
  faClapperboard,
  faCopy,
  faEye,
  faFloppyDisk,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  Control,
  ControlButtonStyler,
  type Positions,
} from "@carma-mapping/map-controls-layout";
import {
  DEFAULT_SHOW_STORE_URL,
  MAX_SHOW_BYTES,
  SHOW_FORMAT,
  SHOW_VERSION,
  newSceneId,
  publishShow,
  showByteSize,
  type Show,
  type ShowScene,
} from "@carma-mapping/show-remote";

import { useAddonScope } from "../../lib/AddonStateContext";
import { routeScopeFromLocation } from "../../lib/addon-overrides-storage";
import type { AddonComponentProps } from "../../lib/registry";
import {
  SHOW_DRAFT_STORAGE_PREFIX,
  moveScene,
  useShowDraft,
  type ShowDraft,
} from "./show-draft";

/**
 * Putting a show together on the desktop: every scene is the map as it stands
 * when it is saved, and "Veröffentlichen" stores the whole list in ceepr for
 * the remote on the phone (`apps/pm-remote`). The display itself is not
 * touched; it only ever gets what the remote writes to the relay.
 */
export type ShowScenesConfig = {
  /** where a publish stores the show; defaults to the pm-show folder in ceepr */
  storeUrl?: string;
  /** the remote app the published link opens; without it only the key is shown */
  remoteUrl?: string;
  /** overrides the draft's per-route key */
  storageKey?: string;
  controlPosition?: Positions;
  controlOrder?: number;
};

const DEFAULT_CONTROL_POSITION: Positions = "topleft";
const DEFAULT_CONTROL_ORDER = 80;

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
}: AddonComponentProps<"showScenes">) => {
  const {
    storeUrl = DEFAULT_SHOW_STORE_URL,
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

  const saveCurrentMap = () => {
    const mapConfig = currentMapConfig();
    if (!mapConfig) {
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
          config: mapConfig,
        },
      ],
    }));
  };

  const overwriteScene = (id: string) => {
    const mapConfig = currentMapConfig();
    if (mapConfig) {
      setStatus(null);
      updateScene(id, { config: mapConfig });
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
  };

  const publish = async () => {
    const show = toShow(draft, new Date().toISOString());
    // taken now: an edit made while the request runs is not in this publish
    const fingerprint = fingerprintOf(draft);
    setStatus({ kind: "busy", text: "Wird veröffentlicht …" });
    try {
      const key = await publishShow(storeUrl, show);
      updateDraft((current) => ({
        ...current,
        published: {
          key,
          at: show.publishedAt,
          sceneCount: show.scenes.length,
          fingerprint,
        },
      }));
      setStatus(null);
    } catch (error) {
      setStatus({
        kind: "error",
        text: `Veröffentlichen fehlgeschlagen (${
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

          <Button type="primary" onClick={saveCurrentMap}>
            Aktuelle Karte als Szene speichern
          </Button>

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
            <Button
              onClick={() => void publish()}
              disabled={
                draft.scenes.length === 0 ||
                isTooLarge ||
                status?.kind === "busy"
              }
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
                    Die Liste wurde seitdem geändert. Das Handy sieht sie erst
                    nach einem neuen Veröffentlichen, mit neuem Link.
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
