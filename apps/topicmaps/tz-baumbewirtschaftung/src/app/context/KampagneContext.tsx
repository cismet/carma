import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { md5ActionFetchDAQ } from "react-cismap/tools/fetching";
import { APP_CONFIG } from "../../config/appConfig";
import {
  resolveAttributeset,
  resolveCampaignAttributeset,
  type AttributesetConfig,
  type ServerAttributeset,
} from "../../config/attributesets";

// `attributeset`, `workflow` and `baumdaten` come from `tzb_attributeset`
// via the campaigns DAQ (wupp #4145); optional because the cloud DB does not
// deliver them yet.
export type Campaign = {
  id: number;
  name: string;
  firma: string;
  ansprechpartner: string | null;
  aktiv: boolean;
} & ServerAttributeset;

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
  /**
   * Anwendungsfall of a Kampagne (wupp #4128/#4145). Unknown or missing id
   * gives the default record.
   */
  attributesetForCampaign: (
    campaignId: number | null | undefined
  ) => AttributesetConfig;
  /**
   * Anwendungsfall of a tree: that of its first Kampagne the user may edit,
   * else of its first Kampagne, else the default record.
   */
  attributesetForFeature: (feature: FeatureWithKampagnen) => AttributesetConfig;
  /** Distinct records of the Kampagnen in the current view (for overlays). */
  activeAttributesets: AttributesetConfig[];
};

type FeatureWithKampagnen = {
  properties?: { kampagnen?: EmbeddedKampagne[] | string };
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

  const attributesetsByCampaign = useMemo(() => {
    const byId = new Map<number, AttributesetConfig>();
    for (const c of campaigns) byId.set(c.id, resolveCampaignAttributeset(c));
    return byId;
  }, [campaigns]);

  const attributesetForCampaign = useCallback(
    (campaignId: number | null | undefined) =>
      (campaignId != null ? attributesetsByCampaign.get(campaignId) : undefined) ??
      resolveAttributeset(null),
    [attributesetsByCampaign]
  );

  const attributesetForFeature = useCallback(
    (feature: FeatureWithKampagnen) => {
      const ids = treeKampagneIds(feature);
      const allowed = new Set(allowedCampaignIds);
      return attributesetForCampaign(
        ids.find((id) => allowed.has(id)) ?? ids[0]
      );
    },
    [allowedCampaignIds, attributesetForCampaign]
  );

  const activeAttributesets = useMemo(() => {
    const seen = new Set<string>();
    const out: AttributesetConfig[] = [];
    for (const id of effectiveCampaignIds) {
      const a = attributesetForCampaign(id);
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      out.push(a);
    }
    return out;
  }, [effectiveCampaignIds, attributesetForCampaign]);

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
    attributesetForCampaign,
    attributesetForFeature,
    activeAttributesets,
  };

  return (
    <KampagneContext.Provider value={value}>
      {children}
    </KampagneContext.Provider>
  );
};

// MapLibre hands `kampagnen` back as a JSON string once a feature went through
// the vector pipeline; tolerate both shapes.
export const treeKampagneIds = (feature: FeatureWithKampagnen): number[] => {
  const raw = feature?.properties?.kampagnen;
  let k: unknown = raw;
  if (typeof raw === "string") {
    try {
      k = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(k)) return [];
  return (k as EmbeddedKampagne[]).map((entry) => entry.id);
};

export const treeMatches = (
  feature: FeatureWithKampagnen,
  effectiveCampaignIds: number[]
): boolean => {
  if (effectiveCampaignIds.length === 0) return false;
  const allowed = new Set(effectiveCampaignIds);
  return treeKampagneIds(feature).some((id) => allowed.has(id));
};
