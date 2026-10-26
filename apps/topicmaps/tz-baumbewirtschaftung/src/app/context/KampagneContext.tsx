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

/** A Kampagne an action on a tree can be stamped with. */
export type ActionChoice = {
  campaignId: number;
  /** "Gießliste 2026 WGS: Baumbewässerung" */
  label: string;
  attributeset: AttributesetConfig;
};

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
   * Kampagnen an action on this tree can be stamped with: its Kampagnen in the
   * current view, else those the user may edit (wupp #4145). A single
   * Kampagne picked under "Ansicht" leaves exactly one; more than one only
   * in the mixed views or for users with several Kampagnen on one tree.
   */
  actionChoicesForFeature: (feature: FeatureWithKampagnen) => ActionChoice[];
  /**
   * Anwendungsfall of a tree: that of its first action choice, else of its
   * first Kampagne, else the default record.
   */
  attributesetForFeature: (feature: FeatureWithKampagnen) => AttributesetConfig;
  /** Distinct records of the Kampagnen in the current view (for overlays). */
  activeAttributesets: AttributesetConfig[];
  /**
   * Whether an action of a tree belongs to the current view (wupp #4145): by
   * its Kampagne, else (actions without `fk_kampagne`) by its action type.
   * Actions without either stay visible.
   */
  actionInView: (action: ActionOfTree) => boolean;
};

/** The fields of a tree action that decide which Kampagne it belongs to. */
export type ActionOfTree = {
  fk_kampagne?: number | null;
  key?: string;
  actionDefinition?: { key?: string };
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

  const actionChoicesForFeature = useCallback(
    (feature: FeatureWithKampagnen): ActionChoice[] => {
      const onTree = treeKampagnen(feature);
      const inView = new Set(effectiveCampaignIds);
      const allowed = new Set(allowedCampaignIds);
      const visible = onTree.filter((k) => inView.has(k.id));
      const picked =
        visible.length > 0 ? visible : onTree.filter((k) => allowed.has(k.id));
      return picked.map((k) => {
        const attributeset = attributesetForCampaign(k.id);
        const name = campaigns.find((c) => c.id === k.id)?.name ?? k.name;
        return {
          campaignId: k.id,
          label: `${name}: ${attributeset.headerLabel}`,
          attributeset,
        };
      });
    },
    [effectiveCampaignIds, allowedCampaignIds, campaigns, attributesetForCampaign]
  );

  const attributesetForFeature = useCallback(
    (feature: FeatureWithKampagnen) =>
      actionChoicesForFeature(feature)[0]?.attributeset ??
      attributesetForCampaign(treeKampagneIds(feature)[0]),
    [actionChoicesForFeature, attributesetForCampaign]
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

  const actionInView = useCallback(
    (action: ActionOfTree) => {
      if (action.fk_kampagne != null) {
        return effectiveCampaignIds.includes(action.fk_kampagne);
      }
      const key = action.key ?? action.actionDefinition?.key;
      if (!key) return true;
      return activeAttributesets.some((a) => a.actionKey === key);
    },
    [effectiveCampaignIds, activeAttributesets]
  );

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
    actionChoicesForFeature,
    attributesetForFeature,
    activeAttributesets,
    actionInView,
  };

  return (
    <KampagneContext.Provider value={value}>
      {children}
    </KampagneContext.Provider>
  );
};

// MapLibre hands `kampagnen` back as a JSON string once a feature went through
// the vector pipeline; tolerate both shapes.
const treeKampagnen = (feature: FeatureWithKampagnen): EmbeddedKampagne[] => {
  const raw = feature?.properties?.kampagnen;
  let k: unknown = raw;
  if (typeof raw === "string") {
    try {
      k = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  return Array.isArray(k) ? (k as EmbeddedKampagne[]) : [];
};

export const treeKampagneIds = (feature: FeatureWithKampagnen): number[] =>
  treeKampagnen(feature).map((entry) => entry.id);

export const treeMatches = (
  feature: FeatureWithKampagnen,
  effectiveCampaignIds: number[]
): boolean => {
  if (effectiveCampaignIds.length === 0) return false;
  const allowed = new Set(effectiveCampaignIds);
  return treeKampagneIds(feature).some((id) => allowed.has(id));
};
