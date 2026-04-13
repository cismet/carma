import { Badge, Popconfirm, Tooltip, message } from "antd";
import {
  AppstoreAddOutlined,
  LogoutOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { getJWT, storeJWT, storeLogin } from "../../store/slices/auth";
import { getDraftFeaturesCount } from "../../store/slices/featuresForms";
import {
  getDraftMode,
  getSelectedAAData,
  getSelectedAAId,
} from "../../store/slices/arbeitsauftraege";
import { incrementFeatureDataVersion } from "../../store/slices/featureCollection";
import { useDispatch, useSelector } from "react-redux";
import { NavLink, useNavigate } from "react-router-dom";
import SettingsUi from "../ui/SettingsUi";
import SyncMenuModal from "../ui/SyncMenuModal";
import { useMapHighlight } from "@carma-mapping/engines/maplibre";
import { useMapPage } from "../../contexts/MapPageContext";
import CreateAAModal from "../ui/CreateAAModal";
import { buildAddFeaturesToAAPayload } from "../../helper/buildNewAAFromFeatures";
import { updateDataByClassName } from "../../helper/apiMethods";

const TopNavbar = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const draftsCount = useSelector(getDraftFeaturesCount);
  const jwt = useSelector(getJWT) as string | null;
  const selectedAAId = useSelector(getSelectedAAId) as number | null;
  const selectedAAData = useSelector(getSelectedAAData) as Record<
    string,
    unknown
  > | null;
  const draftMode = useSelector(getDraftMode) as boolean;
  const {
    config,
    activeHighlights,
    setActiveHighlights,
    aaModalOpen,
    setAaModalOpen,
  } = useMapPage();
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

  const aaButtonTitle = hasHighlights
    ? highlightCount === 1
      ? (() => {
          const props = activeHighlights[0].properties || {};
          const title =
            props.name || props.title || props.label || props.bezeichnung || "";
          return `neuer Arbeitsauftrag anlegen "${title}"`;
        })()
      : `neuer Arbeitsauftrag anlegen (mit ${highlightCount} Protokollen)`
    : "";

  return (
    <div className="flex items-center mx-3 mb-4 mt-2">
      <span className="font-semibold mr-8">BelISDesktop</span>
      <div className="flex items-center gap-4">
        <NavLink
          to="/"
          end
          className={({ isActive }) => `text-base hover:text-gray-600`}
          style={({ isActive }) => ({
            color: isActive ? "#1677ff" : undefined,
          })}
        >
          Fachobjekte
        </NavLink>
        <NavLink
          to="/arbeitsauftraege"
          className={({ isActive }) => `text-base hover:text-gray-600`}
          style={({ isActive }) => ({
            color: isActive ? "#1677ff" : undefined,
          })}
        >
          Arbeitsaufträge
        </NavLink>
        {hasHighlights && (
          <Tooltip title={aaButtonTitle}>
            <Badge
              count={highlightCount}
              size="small"
              offset={[-2, 2]}
              color="#faad14"
              style={{
                fontSize: 10,
                minWidth: 14,
                height: 14,
                lineHeight: "14px",
                padding: "0 3px",
              }}
            >
              <button
                onClick={() => setAaModalOpen(true)}
                className="flex items-center justify-center w-6 h-6 rounded border border-gray-300 bg-white text-gray-500 hover:bg-gray-50"
              >
                <PlusOutlined style={{ fontSize: 14 }} />
              </button>
            </Badge>
          </Tooltip>
        )}
        {canAddToAA && (
          <Popconfirm
            title={`${highlightCount} Protokoll(e) zum ausgewählten Arbeitsauftrag hinzufügen?`}
            onConfirm={() => void handleAddToExistingAA()}
            okText="Hinzufügen"
            cancelText="Abbrechen"
          >
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
                <button className="flex items-center justify-center w-6 h-6 rounded border border-gray-300 bg-white text-green-600 hover:bg-gray-50">
                  <AppstoreAddOutlined style={{ fontSize: 14 }} />
                </button>
              </Badge>
            </Tooltip>
          </Popconfirm>
        )}
      </div>
      <div className="ml-auto flex items-center gap-4">
        {/* {draftsCount > 0 && (
          <span className="text-base text-gray-600">
            nicht gespeicherte Änderungen ({draftsCount})
          </span>
        )} */}
        <NavLink
          to="/key-tables"
          className={({ isActive }) => `text-base hover:text-gray-600`}
          style={({ isActive }) => ({
            color: isActive ? "#1677ff" : undefined,
          })}
        >
          Schlüsseltabellen
        </NavLink>
        <SyncMenuModal />
        <Tooltip title="Ausloggen" placement="bottom">
          <LogoutOutlined
            className="text-base cursor-pointer"
            onClick={() => {
              dispatch(storeJWT(null));
              dispatch(storeLogin(null));
              navigate("/login");
            }}
          />
        </Tooltip>
        <SettingsUi />
      </div>
      <CreateAAModal
        open={aaModalOpen}
        onClose={() => setAaModalOpen(false)}
        onCreated={() => {
          setActiveHighlights(null);
          setHighlightingActive(false);
          clearHighlights();
        }}
        highlights={activeHighlights ?? []}
      />
    </div>
  );
};
export default TopNavbar;
