import { useCallback, useEffect, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useKeyboardListNavigation } from "../../hooks/useKeyboardListNavigation";
import { Spin } from "antd";
import { getFachobjektOfProtocol } from "@carma-appframeworks/belis";
import {
  getAAFeatures,
  getSelectedAAId,
  getSelectedAAData,
  getAALoading,
  getActiveAATab,
  getSelectedAPId,
  getGraphqlLoading,
  getDraftMode,
  getProtokolleSort,
  setSelectedAAId,
  setActiveAATab,
  setSelectedAPId,
  setApOpenedFrom,
} from "../../store/slices/arbeitsauftraege";
import { sortProtokolleByTableSort } from "../../helper/protokolleSortHelpers";
import {
  sortAAFeatures,
  AA_DEFAULT_SORT,
} from "../../helper/aaSortHelpers";
import type { AASortConfig } from "../../helper/aaSortHelpers";
import {
  getAllAADrafts,
  getAllAPDrafts,
  getAPDraftCount,
  getAPDeletions,
  getAPDeletionCount,
  getAAIdsWithAPDrafts,
} from "../../store/slices/arbeitsauftraegeDrafts";
import type { APDraft } from "../../store/slices/arbeitsauftraegeDrafts";
import { getSelectedTeamName } from "../../store/selectors";
import {
  STATUS_LABELS,
  resolveStatusKey,
  statusRgba,
  type StatusKey,
} from "../../config/statusColors";
import type { AppDispatch } from "../../store";

interface ArbeitsauftraegeSidebarProps {
  width: number;
  onFeatureSelect?: (aaId: number) => void;
  onProtokollSelect?: (protokollId: number) => void;
  sort?: AASortConfig;
}

type TabKey = "aa" | "ap";

// Alphas for the three sidebar surfaces. Progress bars sit on white with fine
// 2-3px heights, so a pastel 0.35 reads well. The legend dots are much smaller
// and need more saturation to be legible; they reuse the same value as the
// map (see config/protocolsLayers.ts). Pills around the protokollnummer sit
// behind text, so a softer alpha keeps the number legible. RGB values are
// centralized in config/statusColors.ts.
const SIDEBAR_STATUS_ALPHA = 0.35;
const LEGEND_STATUS_ALPHA = 0.7;
const PILL_STATUS_ALPHA = 0.35;
const STATUS_COLORS: Record<StatusKey, string> = {
  offen: statusRgba("offen", SIDEBAR_STATUS_ALPHA),
  in_bearbeitung: statusRgba("in_bearbeitung", SIDEBAR_STATUS_ALPHA),
  erledigt: statusRgba("erledigt", SIDEBAR_STATUS_ALPHA),
  fehlmeldung: statusRgba("fehlmeldung", SIDEBAR_STATUS_ALPHA),
};
const LEGEND_COLORS: Record<StatusKey, string> = {
  offen: statusRgba("offen", LEGEND_STATUS_ALPHA),
  in_bearbeitung: statusRgba("in_bearbeitung", LEGEND_STATUS_ALPHA),
  erledigt: statusRgba("erledigt", LEGEND_STATUS_ALPHA),
  fehlmeldung: statusRgba("fehlmeldung", LEGEND_STATUS_ALPHA),
};
const PILL_COLORS: Record<StatusKey, string> = {
  offen: statusRgba("offen", PILL_STATUS_ALPHA),
  in_bearbeitung: statusRgba("in_bearbeitung", PILL_STATUS_ALPHA),
  erledigt: statusRgba("erledigt", PILL_STATUS_ALPHA),
  fehlmeldung: statusRgba("fehlmeldung", PILL_STATUS_ALPHA),
};

const FEATURE_TYPE_LABELS: Record<string, string> = {
  tdta_leuchten: "Leuchte",
  tdta_standort_mast: "Standort/Mast",
  schaltstelle: "Schaltstelle",
  mauerlasche: "Mauerlasche",
  leitung: "Leitung",
  abzweigdose: "Abzweigdose",
};

const FEATURE_TYPE_KEYS = Object.keys(FEATURE_TYPE_LABELS);

function formatDate(isoDate: string): string {
  if (!isoDate) return "";
  try {
    return new Date(isoDate).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return isoDate;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getProtocolFeatureType(protokoll: Record<string, any>): string {
  for (const key of FEATURE_TYPE_KEYS) {
    if (protokoll[key] != null) {
      return FEATURE_TYPE_LABELS[key];
    }
  }
  return "Unbekannt";
}


const ArbeitsauftraegeSidebar = ({
  width,
  onFeatureSelect,
  onProtokollSelect,
  sort,
}: ArbeitsauftraegeSidebarProps) => {
  const dispatch: AppDispatch = useDispatch();
  const allFeatures = useSelector(getAAFeatures);
  const selectedAAId = useSelector(getSelectedAAId);
  const selectedAAData = useSelector(getSelectedAAData);
  const loading = useSelector(getAALoading);
  const graphqlLoading = useSelector(getGraphqlLoading);
  const activeTab = useSelector(getActiveAATab);
  const selectedAPId = useSelector(getSelectedAPId);
  const setActiveTab = (tab: TabKey) => dispatch(setActiveAATab(tab));

  // Draft mode
  const draftMode = useSelector(getDraftMode);
  const protokolleSort = useSelector(getProtokolleSort);
  const aaDrafts = useSelector(getAllAADrafts);
  const apDrafts = useSelector(getAllAPDrafts);

  const apDraftCount = useSelector(getAPDraftCount);
  const apDeletions = useSelector(getAPDeletions);
  const apDeletionCount = useSelector(getAPDeletionCount);
  const aaIdsWithAPDrafts = useSelector(getAAIdsWithAPDrafts);

  // Team filter: resolve selectedTeamId → team name, then filter features
  const selectedTeamName = useSelector(getSelectedTeamName);

  const features = useMemo(() => {
    let filtered = selectedTeamName
      ? allFeatures.filter((f) => f.team === selectedTeamName)
      : allFeatures;

    // In draft mode, show only AA features that have drafts or AP drafts/deletions
    if (draftMode) {
      const draftIdSet = new Set(Object.keys(aaDrafts).map(Number));
      for (const aaId of aaIdsWithAPDrafts) {
        draftIdSet.add(Number(aaId));
      }
      filtered = filtered.filter((f) => draftIdSet.has(f.id));
    }

    return sortAAFeatures(filtered, sort ?? AA_DEFAULT_SORT);
  }, [allFeatures, selectedTeamName, draftMode, aaDrafts, aaIdsWithAPDrafts, sort]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const protokolle: Record<string, any>[] = useMemo(() => {
    if (draftMode) {
      // In draft mode, build AP list only for the selected AA
      const currentAAId = selectedAAId != null ? String(selectedAAId) : null;
      if (!currentAAId) return [];

      const seenIds = new Set<number>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const items: Record<string, any>[] = [];

      // Add APs that have value/action drafts belonging to this AA
      for (const [id, draft] of Object.entries(apDrafts)) {
        if (draft.aaId !== currentAAId) continue;
        seenIds.add(Number(id));
        items.push({
          id: Number(id),
          protokollnummer: draft.meta?.protokollnummer ?? id,
          _fachobjektType: draft.meta?.fachobjektType ?? "Unbekannt",
          veranlassung: draft.meta?.veranlassung
            ? { bezeichnung: draft.meta.veranlassung }
            : null,
          _isMarkedForDeletion: id in apDeletions,
        });
      }

      // Add APs that are only marked for deletion (no value draft) for this AA
      for (const [apId, aaId] of Object.entries(apDeletions)) {
        if (aaId !== currentAAId) continue;
        if (seenIds.has(Number(apId))) continue;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const serverAP = selectedAAData?.ar_protokolleArray?.find(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (entry: Record<string, any>) =>
            entry.arbeitsprotokoll?.id === Number(apId)
        )?.arbeitsprotokoll;
        if (serverAP) {
          const fachobjekt = getFachobjektOfProtocol(serverAP);
          items.push({
            id: Number(apId),
            protokollnummer: serverAP.protokollnummer ?? apId,
            _fachobjektType: fachobjekt?.shortname ?? getProtocolFeatureType(serverAP),
            veranlassung: serverAP.veranlassung ?? null,
            _isMarkedForDeletion: true,
          });
        } else {
          // Fallback if server data not available
          items.push({
            id: Number(apId),
            protokollnummer: apId,
            _fachobjektType: "Unbekannt",
            veranlassung: null,
            _isMarkedForDeletion: true,
          });
        }
      }

      return sortProtokolleByTableSort(items, protokolleSort);
    }

    const items = (
      selectedAAData?.ar_protokolleArray
        ?.map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (entry: Record<string, any>) => entry.arbeitsprotokoll
        )
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((p: Record<string, any> | null): p is Record<string, any> => p != null) ?? []
    );
    return sortProtokolleByTableSort(items, protokolleSort);
  }, [draftMode, apDrafts, apDeletions, selectedAAData, selectedAAId, protokolleSort]);

  const selectedFeature = features.find((f) => f.id === selectedAAId);
  const protokolleCount = draftMode
    ? protokolle.length
    : selectedFeature?.total_protokolle ?? protokolle.length;

  const apCount = draftMode ? protokolle.length : protokolleCount;
  const isAPTabDisabled = apCount === 0 || selectedAAId == null;

  // Auto-switch to AA tab when AP tab becomes disabled
  useEffect(() => {
    if (isAPTabDisabled && activeTab === "ap") {
      setActiveTab("aa");
    }
  }, [isAPTabDisabled, activeTab]);

  // Auto-select first AP when switching to AP tab with no selection
  useEffect(() => {
    if (activeTab === "ap" && selectedAPId == null && protokolle.length > 0) {
      dispatch(setSelectedAPId(protokolle[0].id));
      dispatch(setApOpenedFrom("sidebar"));
    }
  }, [activeTab, selectedAPId, protokolle]);

  // Keyboard navigation for AA tab
  const selectedAAIndex = useMemo(
    () => features.findIndex((f) => f.id === selectedAAId),
    [features, selectedAAId]
  );

  const handleAASelect = useCallback(
    (item: (typeof features)[number]) => {
      dispatch(setSelectedAAId(item.id));
      onFeatureSelect?.(item.id);
    },
    [dispatch, onFeatureSelect]
  );

  const { onKeyDown: onAAKeyDown } = useKeyboardListNavigation({
    items: features,
    selectedIndex: selectedAAIndex,
    onSelect: handleAASelect,
    enabled: activeTab === "aa",
  });

  // Keyboard navigation for AP tab
  const selectedAPIndex = useMemo(
    () => protokolle.findIndex((p) => p.id === selectedAPId),
    [protokolle, selectedAPId]
  );

  const handleAPSelect = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (item: Record<string, any>) => {
      dispatch(setSelectedAPId(item.id));
      dispatch(setApOpenedFrom("sidebar"));
      onProtokollSelect?.(item.id);
    },
    [dispatch, onProtokollSelect]
  );

  const { onKeyDown: onAPKeyDown } = useKeyboardListNavigation({
    items: protokolle,
    selectedIndex: selectedAPIndex,
    onSelect: handleAPSelect,
    enabled: activeTab === "ap",
  });

  const handleKeyDown = activeTab === "aa" ? onAAKeyDown : onAPKeyDown;

  return (
    <div
      role="listbox"
      style={{ width, minWidth: width }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="h-full border-r border-gray-200 bg-white flex flex-col overflow-hidden outline-none"
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-gray-200 bg-gray-50 flex items-center">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-gray-700">
            Arbeitsaufträge
          </span>
          <span className="text-xs text-gray-400">{allFeatures.length}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
            activeTab === "aa"
              ? "text-blue-600 border-b-2 border-blue-500 bg-blue-50/50"
              : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
          }`}
          onClick={() => setActiveTab("aa")}
        >
          AA
          <span className="ml-1 text-[10px] bg-gray-200 text-gray-600 rounded-full px-1.5 py-0.5">
            {features.length}
          </span>
        </button>
        <button
          className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
            isAPTabDisabled
              ? "text-gray-300 cursor-not-allowed"
              : activeTab === "ap"
                ? "text-blue-600 border-b-2 border-blue-500 bg-blue-50/50"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
          }`}
          disabled={isAPTabDisabled}
          onClick={() => !isAPTabDisabled && setActiveTab("ap")}
        >
          AP
          <span className={`ml-1 text-[10px] rounded-full px-1.5 py-0.5 ${
            isAPTabDisabled
              ? "bg-gray-100 text-gray-300"
              : "bg-gray-200 text-gray-600"
          }`}>
            {apCount}
          </span>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "aa" ? (
          /* Tab 1: Arbeitsaufträge list */
          graphqlLoading ? (
            <div className="flex justify-center py-8">
              <Spin size="small" />
            </div>
          ) : features.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-gray-400">
              {draftMode
                ? "Keine AA-Entwürfe vorhanden"
                : "Keine Arbeitsaufträge im Kartenausschnitt"}
            </div>
          ) : (
            features.map((item) => {
              const isSelected = item.id === selectedAAId;
              return (
                <div
                  key={item.id}
                  className={`px-3 py-2 border-b border-gray-100 cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-blue-50 border-l-2 border-l-blue-500"
                      : "hover:bg-blue-50/50"
                  }`}
                  onClick={() => {
                    dispatch(setSelectedAAId(item.id));
                    onFeatureSelect?.(item.id);
                  }}
                >
                  <div className="flex justify-between items-baseline">
                    <span className="font-semibold text-sm text-gray-900">
                      AA-{item.nummer}
                    </span>
                    <span className="text-xs text-gray-500">
                      {item.team?.replace("erledigte Arbeitsaufträge", "")}
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline mt-0.5">
                    <span className="text-xs text-gray-400">
                      {formatDate(item.angelegt_am)}
                    </span>
                    <span className="text-xs text-gray-400">
                      {item.total_protokolle} Protokoll
                      {item.total_protokolle !== 1 ? "e" : ""}
                    </span>
                  </div>
                  {/* Mini status bar */}
                  {item.total_protokolle > 0 && (
                    <div className="flex h-1.5 mt-1 rounded-full overflow-hidden bg-gray-100">
                      {item.pct_offen > 0 && (
                        <div
                          style={{
                            width: `${item.pct_offen * 100}%`,
                            backgroundColor: STATUS_COLORS.offen,
                          }}
                        />
                      )}
                      {item.pct_in_bearbeitung > 0 && (
                        <div
                          style={{
                            width: `${item.pct_in_bearbeitung * 100}%`,
                            backgroundColor: STATUS_COLORS.in_bearbeitung,
                          }}
                        />
                      )}
                      {item.pct_erledigt > 0 && (
                        <div
                          style={{
                            width: `${item.pct_erledigt * 100}%`,
                            backgroundColor: STATUS_COLORS.erledigt,
                          }}
                        />
                      )}
                      {item.pct_fehlmeldung > 0 && (
                        <div
                          style={{
                            width: `${item.pct_fehlmeldung * 100}%`,
                            backgroundColor: STATUS_COLORS.fehlmeldung,
                          }}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )
        ) : (
          /* Tab 2: Arbeitsprotokolle */
          <>
            {!draftMode && selectedAAId == null ? (
              <div className="px-3 py-6 text-center text-xs text-gray-400">
                Bitte einen Arbeitsauftrag auswählen
              </div>
            ) : !draftMode && loading ? (
              <div className="flex justify-center py-8">
                <Spin size="small" />
              </div>
            ) : protokolle.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-gray-400">
                {draftMode
                  ? "Keine AP-Entwürfe vorhanden"
                  : "Keine Protokolle vorhanden"}
              </div>
            ) : (
              protokolle.map((p) => {
                const shortname = draftMode
                  ? (p._fachobjektType ?? "Unbekannt")
                  : (getFachobjektOfProtocol(p)?.shortname ?? getProtocolFeatureType(p));
                const isSelected = p.id === selectedAPId;
                const isMarkedForDeletion = draftMode && (p._isMarkedForDeletion || String(p.id) in apDeletions);
                return (
                  <div
                    key={p.id}
                    className={`px-3 py-2 border-b border-gray-100 cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-blue-50 border-l-2 border-l-blue-500"
                        : "hover:bg-blue-50/50"
                    } ${isMarkedForDeletion ? "line-through opacity-50" : ""}`}
                    onClick={() => {
                      dispatch(setSelectedAPId(p.id));
                      dispatch(setApOpenedFrom("sidebar"));
                      onProtokollSelect?.(p.id);
                    }}
                  >
                    <div className="flex items-center gap-2">
                      {(() => {
                        const statusKey = resolveStatusKey(
                          p.arbeitsprotokollstatus?.bezeichnung
                        );
                        const pillBg = statusKey
                          ? PILL_COLORS[statusKey]
                          : undefined;
                        const pillTitle = statusKey
                          ? STATUS_LABELS[statusKey]
                          : "Unbekannt";
                        return (
                          <span
                            className="inline-block px-1.5 py-0.5 rounded-full font-medium text-sm text-gray-900"
                            style={{ backgroundColor: pillBg }}
                            title={pillTitle}
                          >
                            #{p.protokollnummer}
                          </span>
                        );
                      })()}
                      <span className="text-xs text-gray-400 ml-auto">
                        {shortname}
                      </span>
                    </div>
                    <div className="mt-0.5">
                      <span className="text-xs text-gray-500">
                        {p.veranlassung?.bezeichnung ?? "–"}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </>
        )}
      </div>


      {/* Status bar legend */}
      {!draftMode && (
        <div className="px-3 py-1.5 border-t border-gray-200 bg-gray-50 flex gap-3 flex-wrap">
          {(Object.entries(STATUS_LABELS) as [StatusKey, string][]).map(
            ([key, label]) => (
              <div key={key} className="flex items-center gap-1">
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ backgroundColor: LEGEND_COLORS[key] }}
                />
                <span className="text-[10px] text-gray-500">{label}</span>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
};

export default ArbeitsauftraegeSidebar;
