import { Dropdown } from "antd";
import { PlusOutlined, CaretDownFilled } from "@ant-design/icons";
import { useDispatch, useSelector } from "react-redux";
import { useMapPage } from "../../contexts/MapPageContext";
import type { CreateFeatureType } from "../../contexts/MapPageContext";
import { setDraft, setGlobalEditMode } from "../../store/slices/featuresForms";
import { getAllCreationDefaults } from "../../store/slices/creationDefaults";
import { getSelectedFeature } from "../../store/slices/featureCollection";
import {
  buildSyntheticFeature,
  buildSyntheticFetchedData,
} from "../../helper/buildSyntheticFeature";
import { buildStandortGeometryOption } from "../../helper/geometryOptions";

const STANDORT_SOURCE_LAYERS = new Set([
  "tdta_standort_mast",
  "standort_mast",
  "masten",
  "mast",
  "standorte",
]);

// The Redux selectedFeature can come through two shapes:
//   - raw MapLibre click: { sourceLayer, id, properties: <flat tile props>, geometry }
//   - processed/override path (sidebar click, fetched record): { carmaInfo: { sourceLayer },
//     properties: { ..., sourceProps: <DB record> }, geometry }
// Normalize both into the input that buildStandortGeometryOption expects.
const extractStandortFeatureInfo = (
  sf: unknown
):
  | {
      id: number | string;
      geometry: GeoJSON.Geometry;
      properties: Record<string, unknown> | null;
    }
  | null => {
  if (!sf || typeof sf !== "object") return null;
  const f = sf as Record<string, unknown>;
  const carmaInfo = f.carmaInfo as { sourceLayer?: string } | undefined;
  const layer = (carmaInfo?.sourceLayer ?? f.sourceLayer ?? "") as string;
  if (!STANDORT_SOURCE_LAYERS.has(layer)) return null;
  const props = (f.properties ?? null) as Record<string, unknown> | null;
  const sourceProps = props?.sourceProps as
    | Record<string, unknown>
    | null
    | undefined;
  const standortProps =
    sourceProps && typeof sourceProps === "object" ? sourceProps : props;
  const id = (standortProps?.id ?? f.id) as number | string | undefined;
  const geometry = f.geometry as GeoJSON.Geometry | undefined;
  if (id == null || !geometry) return null;
  return { id, geometry, properties: standortProps };
};

const SPRITE_URL = "https://tiles.cismet.de/belis/sprites.png";
const SPRITE_SIZE = 66;
const ICON_DISPLAY_SIZE = 20;
const scale = ICON_DISPLAY_SIZE / SPRITE_SIZE;

const spritePositions: Record<string, { x: number; y: number }> = {
  leuchte: { x: 66, y: 66 },
  standort: { x: 396, y: 0 },
  schaltstelle: { x: 330, y: 0 },
  mauerlasche: { x: 264, y: 0 },
  abzweigdose: { x: 66, y: 0 },
};

export const featureLabels: Record<string, string> = {
  leuchte: "Leuchte",
  standort: "Standort / Mast",
  leitung: "Leitung",
  schaltstelle: "Schaltstelle",
  mauerlasche: "Mauerlasche",
  abzweigdose: "Abzweigdose",
};

export const FeatureIcon = ({ type }: { type: string }) => {
  const pos = spritePositions[type];
  if (pos) {
    return (
      <span
        style={{
          display: "inline-block",
          width: ICON_DISPLAY_SIZE,
          height: ICON_DISPLAY_SIZE,
          backgroundImage: `url(${SPRITE_URL})`,
          backgroundPosition: `-${pos.x * scale}px -${pos.y * scale}px`,
          backgroundSize: `${462 * scale}px ${264 * scale}px`,
          backgroundRepeat: "no-repeat",
          verticalAlign: "middle",
        }}
      />
    );
  }
  if (type === "leitung") {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: ICON_DISPLAY_SIZE,
          height: ICON_DISPLAY_SIZE,
          verticalAlign: "middle",
        }}
      >
        <svg
          width={ICON_DISPLAY_SIZE / 2}
          height={ICON_DISPLAY_SIZE / 2}
          viewBox="0 0 20 20"
        >
          <line
            x1="2"
            y1="16"
            x2="18"
            y2="4"
            stroke="#D3976C"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      </span>
    );
  }
  return null;
};

const createFeatureItems: {
  key: CreateFeatureType & string;
  label: string;
}[] = [
  { key: "leuchte", label: "Leuchte" },
  { key: "standort", label: "Standort / Mast" },
  { key: "leitung", label: "Leitung" },
  { key: "schaltstelle", label: "Schaltstelle" },
  { key: "mauerlasche", label: "Mauerlasche" },
  { key: "abzweigdose", label: "Abzweigdose" },
];

const CreateFeatureDropdown = () => {
  const { onOpenCreationDraft } = useMapPage();
  const dispatch = useDispatch();
  const selectedFeature = useSelector(getSelectedFeature);
  const allDefaults = useSelector(getAllCreationDefaults);

  const handleItemClick = (key: CreateFeatureType & string) => {
    const draftKey = `create:${key}:${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 9)}`;

    // For new Leuchten: if a Standort is currently selected, link to it.
    // Capture it now — opening the creation draft replaces selectedFeature
    // in Redux, so the wrapper can no longer recover this association on its own.
    let standortOption = null;
    if (key === "leuchte") {
      const info = extractStandortFeatureInfo(selectedFeature);
      if (info) {
        standortOption = buildStandortGeometryOption(info);
      }
    }

    const geomKey: string | undefined = standortOption?.key;
    const geom: GeoJSON.Geometry | undefined = standortOption
      ? (standortOption.geometry as GeoJSON.Geometry)
      : undefined;
    const featureProps: Record<string, unknown> = standortOption
      ? { _linkedStandortLabel: standortOption.label }
      : {};

    const seededValues: Record<string, unknown> = {
      ...(allDefaults[key] ?? {}),
    };

    dispatch(
      setDraft({
        featureId: draftKey,
        featureType: key,
        values: seededValues,
        feature: buildSyntheticFeature(key, draftKey, featureProps, geom),
        fetchedData: buildSyntheticFetchedData(key, seededValues),
        isCreation: true,
        geometry: geom,
        geometryKey: geomKey,
        prefillGeometryKey: geomKey,
      })
    );
    dispatch(setGlobalEditMode(true));
    onOpenCreationDraft?.(key, draftKey);
  };

  return (
    <Dropdown
      menu={{
        items: createFeatureItems.map((item) => ({
          key: item.key,
          label: (
            <span className="flex items-center gap-1.5">
              <FeatureIcon type={item.key} />
              {item.label}
            </span>
          ),
          style: { paddingLeft: 4 },
          onClick: () => handleItemClick(item.key),
        })),
      }}
      trigger={["click"]}
    >
      <div className="flex items-center gap-0.5 cursor-pointer">
        <button className="flex items-center justify-center w-6 h-6 rounded border border-gray-300 bg-white text-gray-500 hover:bg-gray-50">
          <PlusOutlined style={{ fontSize: 14 }} />
        </button>
        <CaretDownFilled
          className="text-gray-500 hover:text-gray-700"
          style={{ fontSize: 10 }}
        />
      </div>
    </Dropdown>
  );
};

export default CreateFeatureDropdown;
