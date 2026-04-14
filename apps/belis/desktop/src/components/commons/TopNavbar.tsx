import { Badge, Tooltip } from "antd";
import { LogoutOutlined, PlusOutlined } from "@ant-design/icons";
import { storeJWT, storeLogin } from "../../store/slices/auth";
import { useDispatch } from "react-redux";
import { NavLink, useNavigate } from "react-router-dom";
import SettingsUi from "../ui/SettingsUi";
import SyncMenuModal from "../ui/SyncMenuModal";
import { useMapHighlight } from "@carma-mapping/engines/maplibre";
import { useMapPage } from "../../contexts/MapPageContext";
import CreateAAModal from "../ui/CreateAAModal";
import AddToAAButton from "../ui/AddToAAButton";

const TopNavbar = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { activeHighlights, setActiveHighlights, aaModalOpen, setAaModalOpen } =
    useMapPage();
  const { setHighlightingActive, clearHighlights } = useMapHighlight();
  const hasHighlights = activeHighlights && activeHighlights.length > 0;
  const highlightCount = activeHighlights?.length ?? 0;

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
        <div className="flex items-center gap-2">
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
          <AddToAAButton />
        </div>
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
