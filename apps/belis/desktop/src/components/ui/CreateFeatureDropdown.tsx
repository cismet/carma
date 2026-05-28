import { Dropdown } from "antd";
import type { MenuProps } from "antd";
import { PlusOutlined, CaretDownFilled } from "@ant-design/icons";
import { useSelector } from "react-redux";
import type { CreateFeatureType } from "../../contexts/MapPageContext";
import {
  useCreateFeatureDraft,
  useExtendLeitungDraft,
  extractStandortFeatureInfo,
} from "./useCreateFeatureDraft";
import { getSelectedFeature } from "../../store/slices/featureCollection";
import {
  extractLeitungFeatureInfo,
  formatStandortLabel,
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
  const handleItemClick = useCreateFeatureDraft();
  const handleExtendLeitung = useExtendLeitungDraft();
  const selectedFeature = useSelector(getSelectedFeature);
  const standortInfo = extractStandortFeatureInfo(selectedFeature);
  const leitungInfo = extractLeitungFeatureInfo(selectedFeature);

  const items: MenuProps["items"] = [];

  // When a Standort is selected, offer an explicit entry to create a new
  // Leuchte linked to it — e.g. "Leuchte zu Standort 19 (Neviandstr.)
  // hinzufügen". This is the only entry that links; the plain "Leuchte" item
  // below always creates an empty, unlinked draft.
  if (standortInfo) {
    items.push({
      key: "leuchte-linked-standort",
      label: (
        <span className="flex items-center gap-1.5">
          <FeatureIcon type="leuchte" />
          {`Leuchte zu ${formatStandortLabel(
            standortInfo.properties
          )} hinzufügen`}
        </span>
      ),
      style: { paddingLeft: 4 },
      onClick: () => handleItemClick("leuchte", { linkToSelectedStandort: true }),
    });
  }

  // When a Leitung is selected, offer "Leitung <id> verlängern" — opens an
  // extension draft that lets the user pick a LineString measurement to
  // auto-connect to the existing line. Selection is exclusive, so this branch
  // and the Standort one above never fire together.
  if (leitungInfo) {
    items.push({
      key: "leitung-verlaengern",
      label: (
        <span className="flex items-center gap-1.5">
          <FeatureIcon type="leitung" />
          {`Leitung ${leitungInfo.id} verlängern`}
        </span>
      ),
      style: { paddingLeft: 4 },
      onClick: () => handleExtendLeitung(),
    });
  }

  for (const item of createFeatureItems) {
    items.push({
      key: item.key,
      label: (
        <span className="flex items-center gap-1.5">
          <FeatureIcon type={item.key} />
          {item.label}
        </span>
      ),
      style: { paddingLeft: 4 },
      onClick: () => handleItemClick(item.key),
    });
  }

  return (
    <Dropdown menu={{ items }} trigger={["click"]}>
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
