import { Badge, Dropdown, Modal, Tooltip, message } from "antd";
import {
  LogoutOutlined,
  PlusOutlined,
  AppstoreAddOutlined,
  CaretDownFilled,
} from "@ant-design/icons";
import type { MenuProps } from "antd";
import { storeJWT, storeLogin, storePermissions } from "../../store/slices/auth";
import { getJWT, getIsReadOnly } from "../../store/slices/auth";
import { useDispatch, useSelector } from "react-redux";
import { NavLink, useNavigate } from "react-router-dom";
import SettingsUi from "../ui/SettingsUi";
import SyncMenuModal from "../ui/SyncMenuModal";
import HelpModal from "../ui/HelpModal";
import { useMapHighlight } from "@carma-mapping/engines/maplibre";
import { getApplicationVersion } from "@carma-commons/utils";
import versionData from "../../version.json";
import { useMapPage } from "../../contexts/MapPageContext";
import CreateAAModal from "../ui/CreateAAModal";
import {
  getDraftMode,
  getSelectedAAData,
  getSelectedAAId,
} from "../../store/slices/arbeitsauftraege";
import { incrementFeatureDataVersion } from "../../store/slices/featureCollection";
import { buildAddFeaturesToAAPayload } from "../../helper/buildNewAAFromFeatures";
import { updateDataByClassName } from "../../helper/apiMethods";
import CreateFeatureDropdown from "../ui/CreateFeatureDropdown";

const TopNavbar = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
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

  const jwt = useSelector(getJWT) as string | null;
  const isReadOnly = useSelector(getIsReadOnly) as boolean;
  const selectedAAId = useSelector(getSelectedAAId) as number | null;
  const selectedAAData = useSelector(getSelectedAAData) as Record<
    string,
    unknown
  > | null;
  const draftMode = useSelector(getDraftMode) as boolean;

  // Show the dev marker whenever this is not a live build (stamped with
  // `triggered: "live"` in version.json — the same signal getApplicationVersion
  // uses). Everything else (local dev, dev/PR builds) counts as dev.
  const isLiveVersion =
    (versionData as { triggered?: string | null }).triggered === "live";

  const isOnAAPage = config.sidebarVariant === "arbeitsauftraege";
  const canAddToExistingAA =
    selectedAAId != null && selectedAAData != null && !draftMode;

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
      // Close highlight mode after adding to an AA, same as creating a new AA,
      // so the map isn't left in the dimmed/highlighted state.
      setActiveHighlights(null);
      setHighlightingActive(false);
      clearHighlights();
      dispatch(incrementFeatureDataVersion());
    } catch (err) {
      console.error("[AddToAA] ERROR", err);
      void message.error("Fehler beim Hinzufügen der Protokolle");
    }
  };

  const dropdownItems: MenuProps["items"] = [
    {
      key: "create",
      icon: <PlusOutlined />,
      label: "Arbeitsauftrag anlegen",
      onClick: () => setAaModalOpen(true),
    },
    {
      key: "add",
      icon: <AppstoreAddOutlined />,
      label: "Zum ausgewählten AA hinzufügen",
      disabled: !canAddToExistingAA,
      onClick: () => {
        Modal.confirm({
          title: `${highlightCount} Protokoll(e) zum ausgewählten Arbeitsauftrag hinzufügen?`,
          okText: "Hinzufügen",
          cancelText: "Abbrechen",
          onOk: async () => {
            await handleAddToExistingAA();
          },
        });
      },
    },
  ];

  const aaButtonTitle = hasHighlights
    ? `neuer Arbeitsauftrag anlegen (mit ${highlightCount} Protokollen)`
    : "";

  return (
    <div className="relative flex items-center mx-3 mb-4 mt-3">
      {!isLiveVersion && (
        <span className="absolute left-1/2 -translate-x-1/2 text-[11px] font-medium tracking-wide text-gray-400 whitespace-nowrap pointer-events-none">
          Entwicklungsversion
        </span>
      )}
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
        {!isReadOnly && <CreateFeatureDropdown />}
        <NavLink
          to="/arbeitsauftraege"
          className={({ isActive }) => `text-base hover:text-gray-600`}
          style={({ isActive }) => ({
            color: isActive ? "#1677ff" : undefined,
          })}
        >
          Arbeitsaufträge
        </NavLink>
        {!isReadOnly &&
          hasHighlights &&
          (isOnAAPage && selectedAAId != null && selectedAAData != null ? (
            <Dropdown menu={{ items: dropdownItems }} trigger={["click"]}>
              <div className="flex items-center gap-0.5">
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
                  <button className="flex items-center justify-center w-6 h-6 rounded border border-gray-300 bg-white text-gray-500 hover:bg-gray-50">
                    <PlusOutlined style={{ fontSize: 14 }} />
                  </button>
                </Badge>
                <CaretDownFilled
                  className="text-gray-500 cursor-pointer hover:text-gray-700"
                  style={{ fontSize: 10 }}
                />
              </div>
            </Dropdown>
          ) : (
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
          ))}
      </div>
      <div className="ml-auto flex items-center gap-4">
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
              dispatch(storePermissions(undefined));
              navigate("/login");
            }}
          />
        </Tooltip>
        <HelpModal />
        <SettingsUi />
      </div>
      <CreateAAModal
        open={aaModalOpen}
        onClose={() => setAaModalOpen(false)}
        onCreated={() => {
          setActiveHighlights(null);
          setHighlightingActive(false);
          clearHighlights();
          dispatch(incrementFeatureDataVersion());
        }}
        highlights={activeHighlights ?? []}
      />
    </div>
  );
};
export default TopNavbar;
