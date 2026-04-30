import { Dropdown } from "antd";
import { PlusOutlined, CaretDownFilled } from "@ant-design/icons";
import { useDispatch } from "react-redux";
import { useMapPage } from "../../contexts/MapPageContext";
import type { CreateFeatureType } from "../../contexts/MapPageContext";
import { setDraft } from "../../store/slices/featuresForms";
import {
  buildSyntheticFeature,
  buildSyntheticFetchedData,
} from "../../helper/buildSyntheticFeature";
import {
  getDefaultGeometryKey,
  getGeometryByKey,
} from "../../helper/geometryOptions";

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

  const handleItemClick = (key: CreateFeatureType & string) => {
    const draftKey = `create:${key}:${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 9)}`;
    const geomKey = getDefaultGeometryKey(key);
    const geom = getGeometryByKey(geomKey);
    dispatch(
      setDraft({
        featureId: draftKey,
        featureType: key,
        values: {},
        feature: buildSyntheticFeature(key, draftKey, {}, geom),
        fetchedData: buildSyntheticFetchedData(key, {}),
        isCreation: true,
        geometry: geom,
        geometryKey: geomKey,
      })
    );
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
