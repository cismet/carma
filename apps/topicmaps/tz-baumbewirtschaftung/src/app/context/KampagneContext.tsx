import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { md5ActionFetchDAQ } from "react-cismap/tools/fetching";
import { APP_CONFIG } from "../../config/appConfig";

export type Campaign = {
  id: number;
  name: string;
  firma: string;
  ansprechpartner: string | null;
  aktiv: boolean;
};

export type EmbeddedKampagne = {
  id: number;
  name: string;
  firma?: string;
  aktiv?: boolean;
};

export type ViewSelection = "active" | "all" | number;

export type KampagneContextValue = {
  ready: boolean;
  showAll: boolean;
  allowedNames: string[] | null;
  allowedCampaignIds: number[];
  effectiveCampaignIds: number[];
  campaigns: Campaign[];
  keineCampaignId: number | null;
  viewSelection: ViewSelection;
  setViewSelection: (v: ViewSelection) => void;
  error: string | null;
  configAttributeMissing: boolean;
};

const UNASSIGNED_NAME = "keine";

const KampagneContext = createContext<KampagneContextValue | null>(null);

export const useKampagne = () => {
  const ctx = useContext(KampagneContext);
  if (!ctx) {
    throw new Error("useKampagne must be used inside <KampagneProvider>");
  }
  return ctx;
};

const APP_KEY = "tz.baumbewirtschaftung";
const CONFIG_ATTR_URL = `${APP_CONFIG.restService}configattributes/${APP_CONFIG.configAttributeKey}`;

type Props = {
  jwt?: string | null;
  children: ReactNode;
};

export const KampagneProvider = ({ jwt, children }: Props) => {
  const [ready, setReady] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [allowedNames, setAllowedNames] = useState<string[] | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [viewSelection, setViewSelection] = useState<ViewSelection>("active");
  const [error, setError] = useState<string | null>(null);
  const [configAttributeMissing, setConfigAttributeMissing] = useState(false);

  useEffect(() => {
    if (!jwt) {
      setReady(false);
      setShowAll(false);
      setAllowedNames(null);
      setCampaigns([]);
      setViewSelection("active");
      setError(null);
      setConfigAttributeMissing(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const [attrRes, campaignsRes] = await Promise.all([
          fetch(CONFIG_ATTR_URL, {
            headers: { Authorization: `Bearer ${jwt}` },
          }),
          md5ActionFetchDAQ(
            APP_KEY,
            APP_CONFIG.restService,
            jwt,
            APP_CONFIG.daqKeys.campaigns
          ),
        ]);

        if (cancelled) return;

        let nextShowAll = false;
        let nextAllowedNames: string[] | null = null;
        let attrMissing = false;

        if (attrRes.ok) {
          const body = await attrRes.json();
          const raw = body?.[APP_CONFIG.configAttributeKey];
          if (typeof raw === "string") {
            const trimmed = raw.trim();
            if (trimmed === "*") {
              nextShowAll = true;
            } else if (trimmed.length > 0) {
              nextAllowedNames = trimmed
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
            } else {
              attrMissing = true;
            }
          } else {
            attrMissing = true;
          }
        } else if (attrRes.status === 404) {
          attrMissing = true;
        } else {
          throw new Error(`configattribute fetch failed: ${attrRes.status}`);
        }

        const loadedCampaigns: Campaign[] =
          (campaignsRes?.data as Campaign[]) ?? [];

        setShowAll(nextShowAll);
        setAllowedNames(nextShowAll ? null : nextAllowedNames);
        setCampaigns(loadedCampaigns);
        setConfigAttributeMissing(attrMissing);
        setError(null);
        setReady(true);
      } catch (e) {
        if (cancelled) return;
        console.error("[Kampagne] failed to load auth context", e);
        setError("Kampagne-Berechtigungen konnten nicht geladen werden");
        setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [jwt]);

  const allowedCampaignIds = useMemo(() => {
    if (showAll) {
      return campaigns.map((c) => c.id);
    }
    if (!allowedNames || allowedNames.length === 0) return [];
    const allowed = new Set(allowedNames.map((n) => n.toLowerCase()));
    return campaigns
      .filter((c) => allowed.has(c.name.toLowerCase()))
      .map((c) => c.id);
  }, [showAll, allowedNames, campaigns]);

  const keineCampaignId = useMemo(() => {
    const k = campaigns.find(
      (c) => c.name.toLowerCase() === UNASSIGNED_NAME
    );
    return k ? k.id : null;
  }, [campaigns]);

  const effectiveCampaignIds = useMemo(() => {
    // Non-admin users always see exactly their allowed kampagnen — no further
    // filtering. The view-selection mechanism only applies to "*" users.
    if (!showAll) return allowedCampaignIds;

    if (typeof viewSelection === "number") {
      return allowedCampaignIds.includes(viewSelection)
        ? [viewSelection]
        : allowedCampaignIds;
    }
    if (viewSelection === "all") return allowedCampaignIds;
    // "active": real kampagnen only, exclude the "keine" placeholder.
    if (keineCampaignId == null) return allowedCampaignIds;
    return allowedCampaignIds.filter((id) => id !== keineCampaignId);
  }, [allowedCampaignIds, viewSelection, showAll, keineCampaignId]);

  const value: KampagneContextValue = {
    ready,
    showAll,
    allowedNames,
    allowedCampaignIds,
    effectiveCampaignIds,
    campaigns,
    keineCampaignId,
    viewSelection,
    setViewSelection,
    error,
    configAttributeMissing,
  };

  return (
    <KampagneContext.Provider value={value}>
      {children}
    </KampagneContext.Provider>
  );
};

export const treeKampagneIds = (feature: {
  properties?: { kampagnen?: EmbeddedKampagne[] };
}): number[] => {
  const k = feature?.properties?.kampagnen;
  if (!Array.isArray(k)) return [];
  return k.map((entry) => entry.id);
};

export const treeMatches = (
  feature: { properties?: { kampagnen?: EmbeddedKampagne[] } },
  effectiveCampaignIds: number[]
): boolean => {
  if (effectiveCampaignIds.length === 0) return false;
  const allowed = new Set(effectiveCampaignIds);
  return treeKampagneIds(feature).some((id) => allowed.has(id));
};
