import { Badge, Modal, Tooltip, message } from "antd";
import { AppstoreAddOutlined } from "@ant-design/icons";
import { useDispatch, useSelector } from "react-redux";
import { getJWT } from "../../store/slices/auth";
import {
  getDraftMode,
  getSelectedAAData,
  getSelectedAAId,
} from "../../store/slices/arbeitsauftraege";
import { incrementFeatureDataVersion } from "../../store/slices/featureCollection";
import { useMapHighlight } from "@carma-mapping/engines/maplibre";
import { useMapPage } from "../../contexts/MapPageContext";
import { buildAddFeaturesToAAPayload } from "../../helper/buildNewAAFromFeatures";
import { updateDataByClassName } from "../../helper/apiMethods";

const AddToAAButton = () => {
  const dispatch = useDispatch();
  const jwt = useSelector(getJWT) as string | null;
  const selectedAAId = useSelector(getSelectedAAId) as number | null;
  const selectedAAData = useSelector(getSelectedAAData) as Record<
    string,
    unknown
  > | null;
  const draftMode = useSelector(getDraftMode) as boolean;
  const { config, activeHighlights, setActiveHighlights } = useMapPage();
  const { setHighlightingActive, clearHighlights } = useMapHighlight();

  const hasHighlights = activeHighlights && activeHighlights.length > 0;
  const highlightCount = activeHighlights?.length ?? 0;
  const isOnAAPage = config.sidebarVariant === "arbeitsauftraege";
  const canAddToAA =
    hasHighlights &&
    isOnAAPage &&
    selectedAAId != null &&
    selectedAAData != null &&
    !draftMode;

  const handleAddToExistingAA = async () => {
    if (!jwt || !selectedAAId || !selectedAAData || !activeHighlights) return;

    const existingProtokolle = (selectedAAData.ar_protokolleArray ??
      []) as Record<string, unknown>[];

    try {
      const payload = buildAddFeaturesToAAPayload({
        aaId: selectedAAId,
        existingProtokolle,
        features: activeHighlights,
      });
      console.log("[AddToAA] payload", JSON.stringify(payload, null, 2));

      const result = await updateDataByClassName(
        jwt,
        "arbeitsauftrag",
        payload
      );
      console.log("[AddToAA] server response", result);

      void message.success(
        `${activeHighlights.length} Protokoll(e) zum Arbeitsauftrag hinzugefügt`
      );
      setActiveHighlights(null);
      setHighlightingActive(false);
      clearHighlights();
      dispatch(incrementFeatureDataVersion());
    } catch (err) {
      console.error("[AddToAA] ERROR", err);
      void message.error("Fehler beim Hinzufügen der Protokolle");
    }
  };

  if (!canAddToAA) return null;

  const handleClick = () => {
    Modal.confirm({
      title: `${highlightCount} Protokoll(e) zum ausgewählten Arbeitsauftrag hinzufügen?`,
      okText: "Hinzufügen",
      cancelText: "Abbrechen",
      onOk: async () => {
        await handleAddToExistingAA();
      },
    });
  };

  return (
    <Tooltip
      title={`${highlightCount} Protokoll(e) zum ausgewählten AA hinzufügen`}
    >
      <Badge
        count={highlightCount}
        size="small"
        offset={[-2, 2]}
        color="#52c41a"
        style={{
          fontSize: 10,
          minWidth: 14,
          height: 14,
          lineHeight: "14px",
          padding: "0 3px",
        }}
      >
        <button
          className="flex items-center justify-center w-6 h-6 rounded border border-gray-300 bg-white text-green-600 hover:bg-gray-50"
          onClick={handleClick}
        >
          <AppstoreAddOutlined style={{ fontSize: 14 }} />
        </button>
      </Badge>
    </Tooltip>
  );
};

export default AddToAAButton;
