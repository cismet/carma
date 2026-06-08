import {
  useCallback,
  useEffect,
  useState,
  useRef,
  ReactNode,
  useMemo,
} from "react";
import { Tabs } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useSelector } from "react-redux";
import FormHeader from "./FormHeader";
import DangerZone from "./DangerZone";
import { useDeleteFeature } from "./DeleteFeatureContext";
import { isDangerousDeleteModeActive } from "../../../store/slices/mapSettings";
import { DokumentItem } from "../DocumentPreview";
import FilePreview, {
  SavedImageUrls,
  getFileType,
  getDocumentKey,
  PendingUpload,
} from "../FilePreview";
import { getDocumentBlobUrl } from "../../../helper/documentHelper";
import RawDisplay from "../RawDisplay";
import type { DraftFile } from "../../../store/slices/featuresForms";

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

interface AdditionalTab {
  key: string;
  label: string;
  children: ReactNode;
}

interface ExtraGeneralTab {
  key: string;
  label: ReactNode;
  children: ReactNode;
}

const ADD_TAB_KEY = "addtabsentinel";
const CREATE_DRAFT_KEY = "createdraftsentinel";

export interface ExtraDocumentSection {
  title: string;
  documents: DokumentItem[];
}

interface FeatureFormLayoutProps {
  title: string;
  subtitle: string;
  cancelLabel?: string;
  isCreation?: boolean;
  formHeaderContent?: ReactNode;
  children: ReactNode;
  documents?: DokumentItem[];
  mainDocumentsTitle?: string;
  extraDocumentSections?: ExtraDocumentSection[];
  jwt?: string | null;
  draftFiles?: DraftFile[];
  onDraftFilesChange?: (files: DraftFile[]) => void;
  removedDocumentKeys?: Set<string>;
  onToggleRemoveDocument?: (key: string) => void;
  onCancel?: () => void;
  onSave?: () => void;
  saving?: boolean;
  debugData?: unknown;
  rawFeatureData?: unknown;
  additionalTabs?: AdditionalTab[];
  /** Tabs rendered immediately after the general tab. Labels accept ReactNode
   * so callers can embed a close icon. Used for runtime-added Leuchte tabs in
   * the creation flow. */
  extraGeneralTabs?: ExtraGeneralTab[];
  /** When provided, a "+" sentinel tab is rendered anchored right after the
   * additional tabs (i.e. directly after Standort in the Leuchten-creation
   * flow). Clicking it invokes this callback. If the callback returns a tab
   * key (string), that tab becomes active; otherwise the active tab stays put. */
  onAddTab?: () => string | void;
  /** When provided, a trailing "+" tab is rendered at the very end of the
   * tab bar (after every other tab). Clicking it invokes this callback —
   * e.g. to spawn a new creation draft of the same feature type — without
   * changing the active tab. */
  onCreateRelatedDraft?: () => void;
  /** Color of the header "+" create-related-draft button. Defaults to "green". */
  createDraftButtonVariant?: "green" | "white";
  /** Optional Alt-gated header "copy values" button handler. */
  onCopyValues?: () => void;
  /** Label for the main/general tab. Defaults to "Allgemein". Accepts a
   * ReactNode so callers (e.g. LeuchteForm) can embed an inline close icon. */
  generalTabLabel?: ReactNode;
  /** Whether additional tabs render before or after the general tab. Default "after". */
  additionalTabsPosition?: "before" | "after";
  loading?: boolean;
  readOnly?: boolean;
  hasDraft?: boolean;
  onToggleReadOnly?: () => void;
  singleColumn?: boolean;
  onBack?: () => void;
  sideContent?: ReactNode;
  customDraftsCount?: number;
  onSaveAll?: () => void;
  /** Identity used to remount the inner Tabs when the underlying draft
   * changes. Antd Tabs is uncontrolled, so its active-tab state survives
   * prop changes — keying on this resets the active tab to the default
   * (e.g. back to "Standort" each time a new Leuchten draft is opened). */
  tabsResetKey?: string;
  /** A request from the sidebar to focus a specific tab — raised when the
   * user clicks a nested row in the "Entwürfe" list (the Standort parent or
   * one of its Leuchten children). The bumped `nonce` makes each request
   * distinct so the same tab can be re-focused. */
  tabFocusRequest?: { tabKey: string; nonce: number };
  /** Fires whenever the active tab key changes, so a parent form (e.g.
   * LeuchteForm) can seed an action — like the green header "+" — from the
   * tab the user is actually looking at, not always the general slice. */
  onActiveTabChange?: (key: string) => void;
}

const FeatureFormLayout = ({
  title,
  subtitle,
  cancelLabel,
  children,
  documents = [],
  mainDocumentsTitle = "Dateien",
  extraDocumentSections = [],
  jwt,
  draftFiles = [],
  onDraftFilesChange,
  removedDocumentKeys,
  onToggleRemoveDocument,
  onCancel,
  onSave,
  saving,
  debugData,
  rawFeatureData,
  additionalTabs = [],
  extraGeneralTabs = [],
  onAddTab,
  onCreateRelatedDraft,
  createDraftButtonVariant,
  onCopyValues,
  generalTabLabel = "Allgemein",
  additionalTabsPosition = "after",
  loading,
  readOnly,
  hasDraft,
  onToggleReadOnly,
  singleColumn,
  onBack,
  sideContent,
  isCreation,
  formHeaderContent,
  customDraftsCount,
  onSaveAll,
  tabsResetKey,
  tabFocusRequest,
  onActiveTabChange,
}: FeatureFormLayoutProps) => {
  // Deduplicate documents to prevent stale data from appearing as extra items
  // when switching between features quickly.
  const uniqueDocuments = useMemo(() => {
    const seen = new Set<string>();
    return documents.filter((doc) => {
      const key = getDocumentKey(doc);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [documents]);

  // Support both regular query params and hash-based routing (/#/?param=value)
  const showRaw = useMemo(() => {
    const hashQuery = window.location.hash.split("?")[1] || "";
    const param = new URLSearchParams(
      hashQuery || window.location.search
    ).get("showRaw");
    if (param !== null) return param === "true";
    return window.location.hostname === "localhost";
  }, []);
  const [isWideScreen, setIsWideScreen] = useState(
    typeof window !== "undefined" ? window.innerWidth > 1200 : false
  );
  // "Gefährlicher Löschmodus": opt-in setting that surfaces a destructive
  // delete action at the bottom of every existing feature's form. The handler
  // is provided via context by FeaturesFormsWrapper and is `undefined` when
  // deletion is not allowed (creation draft / read-only user), which keeps the
  // box hidden regardless of the setting.
  const dangerousDeleteMode = useSelector(isDangerousDeleteModeActive);
  const onDeleteFeature = useDeleteFeature();

  // Controlled active tab key so we can intercept clicks on the "+" sentinel
  // (which must add a new Leuchte tab without navigating to a blank pane).
  // The initial value matches the legacy uncontrolled defaultActiveKey: when
  // additional tabs render before the general tab, start on the first
  // additional tab (Standort); otherwise start on the general tab.
  const defaultActiveTabKey = useMemo(() => {
    return additionalTabsPosition === "before" && additionalTabs.length > 0
      ? additionalTabs[0].key
      : "general";
  }, [additionalTabsPosition, additionalTabs]);
  const [activeTabKey, setActiveTabKey] = useState(defaultActiveTabKey);
  // Broadcast the active tab to the parent form so it can target an action at
  // the tab the user is looking at (e.g. the green header "+" seeding from
  // Leuchte 2 rather than Leuchte 1). Fires on every change — covers the
  // tabsResetKey restore, sidebar focus, removed-tab fallback, and direct
  // clicks — without having to dispatch from each setActiveTabKey site.
  useEffect(() => {
    onActiveTabChange?.(activeTabKey);
  }, [activeTabKey, onActiveTabChange]);
  // Per-draft memory of the active tab, keyed by `tabsResetKey`. A draft seen
  // for the first time has no entry and opens on the default ("Standort" for
  // a new Leuchte); revisiting a draft restores the tab it last had open.
  const tabMemoryRef = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    const remembered =
      tabsResetKey != null ? tabMemoryRef.current.get(tabsResetKey) : undefined;
    setActiveTabKey(remembered ?? defaultActiveTabKey);
  }, [tabsResetKey, defaultActiveTabKey]);
  // Sidebar-driven tab focus: clicking a nested Leuchten-draft row asks the
  // form to open that row's tab. Keyed on `nonce` so a repeat request for the
  // same tab still fires; declared after the restore effect above so that on a
  // draft switch (both effects run) the requested tab wins over the default.
  const lastFocusNonceRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!tabFocusRequest) return;
    if (lastFocusNonceRef.current === tabFocusRequest.nonce) return;
    lastFocusNonceRef.current = tabFocusRequest.nonce;
    setActiveTabKey(tabFocusRequest.tabKey);
    if (tabsResetKey != null) {
      tabMemoryRef.current.set(tabsResetKey, tabFocusRequest.tabKey);
    }
  }, [tabFocusRequest, tabsResetKey]);
  // When the active tab is an extra Leuchte tab that the user just removed,
  // its key no longer matches any rendered tab and antd would show a blank
  // pane. Fall back to the neighbour tab — the previous Leuchte tab if there
  // is one, else the next, else the general "Leuchte 1" tab — mirroring how
  // antd's editable Tabs pick a new active tab after a close.
  const extraGeneralTabKeys = useMemo(
    () => extraGeneralTabs.map((t) => t.key),
    [extraGeneralTabs]
  );
  const prevExtraGeneralTabKeysRef = useRef<string[]>(extraGeneralTabKeys);
  const prevTabsResetKeyRef = useRef(tabsResetKey);
  useEffect(() => {
    const draftChanged = prevTabsResetKeyRef.current !== tabsResetKey;
    prevTabsResetKeyRef.current = tabsResetKey;
    const prevKeys = prevExtraGeneralTabKeysRef.current;
    prevExtraGeneralTabKeysRef.current = extraGeneralTabKeys;
    // On a draft switch the restore effect above already picks the tab; the
    // outgoing draft's extra tabs must not be mistaken for "removed" ones here.
    if (draftChanged) return;
    if (extraGeneralTabKeys.includes(activeTabKey)) return;
    const removedIdx = prevKeys.indexOf(activeTabKey);
    // Only act when the active tab itself was an extra Leuchte tab that is
    // now gone; other tab transitions are handled by handleTabChange.
    if (removedIdx < 0) return;
    const fallback =
      extraGeneralTabKeys[removedIdx - 1] ??
      extraGeneralTabKeys[removedIdx] ??
      "general";
    setActiveTabKey(fallback);
    if (tabsResetKey != null) {
      tabMemoryRef.current.set(tabsResetKey, fallback);
    }
  }, [extraGeneralTabKeys, activeTabKey, tabsResetKey]);
  const handleTabChange = useCallback(
    (key: string) => {
      // The "create related draft" sentinel spawns a new draft and never
      // becomes the active tab — the click just triggers the callback.
      if (key === CREATE_DRAFT_KEY) {
        onCreateRelatedDraft?.();
        return;
      }
      let nextKey = key;
      if (key === ADD_TAB_KEY) {
        const newKey = onAddTab?.();
        if (typeof newKey !== "string") return;
        nextKey = newKey;
      }
      setActiveTabKey(nextKey);
      if (tabsResetKey != null) {
        tabMemoryRef.current.set(tabsResetKey, nextKey);
      }
    },
    [onAddTab, onCreateRelatedDraft, tabsResetKey]
  );

  // Cache image URLs at this level to persist across layout changes (resize)
  const [savedImageUrls, setSavedImageUrls] = useState<SavedImageUrls>({});

  // Derive PendingUpload[] from persisted DraftFile[] (base64 data URLs need no cleanup)
  const pendingUploads: PendingUpload[] = useMemo(
    () =>
      draftFiles.map((df) => ({
        id: df.id,
        fileName: df.fileName,
        previewUrl: df.base64Data,
        originalFileName: df.originalFileName,
      })),
    [draftFiles]
  );

  const handleAddFiles = useCallback(
    async (files: File[]) => {
      const newDraftFiles: DraftFile[] = await Promise.all(
        files.map(async (file) => {
          const dotIndex = file.name.lastIndexOf(".");
          const nameWithoutExt =
            dotIndex > 0 ? file.name.slice(0, dotIndex) : file.name;
          const base64Data = await fileToBase64(file);
          return {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            fileName: nameWithoutExt,
            originalFileName: file.name,
            base64Data,
            mimeType: file.type,
            size: file.size,
          };
        })
      );
      onDraftFilesChange?.([...draftFiles, ...newDraftFiles]);
    },
    [draftFiles, onDraftFilesChange]
  );

  const handleRemovePendingUpload = useCallback(
    (id: string) => {
      onDraftFilesChange?.(draftFiles.filter((f) => f.id !== id));
    },
    [draftFiles, onDraftFilesChange]
  );

  const handlePendingUploadNameChange = useCallback(
    (id: string, name: string) => {
      onDraftFilesChange?.(
        draftFiles.map((f) => (f.id === id ? { ...f, fileName: name } : f))
      );
    },
    [draftFiles, onDraftFilesChange]
  );

  // Listen for window resize to toggle layout
  useEffect(() => {
    const handleResize = () => {
      setIsWideScreen(window.innerWidth > 1300);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Combine main + extra documents for image pre-fetching
  const allDocumentsForImages = useMemo(
    () => [
      ...uniqueDocuments,
      ...extraDocumentSections.flatMap((s) => s.documents),
    ],
    [uniqueDocuments, extraDocumentSections]
  );

  // Memoize image documents to avoid recreating the array on every render
  const imageDocuments = useMemo(
    () =>
      allDocumentsForImages.filter((doc) => {
        const objectName = doc.dms_url?.url?.object_name || "";
        return getFileType(objectName) === "image";
      }),
    [allDocumentsForImages]
  );

  // All lightbox-compatible docs (images + PDFs) across every section, each
  // tagged with its section title so the lightbox can show it top-left per slide.
  const allLightboxDocuments = useMemo(() => {
    const canShowInLightbox = (doc: DokumentItem) => {
      const ft = getFileType(doc.dms_url?.url?.object_name || "");
      return ft === "image" || ft === "pdf";
    };
    return [
      ...uniqueDocuments.filter(canShowInLightbox).map((doc) => ({
        doc,
        sectionTitle: mainDocumentsTitle,
      })),
      ...extraDocumentSections.flatMap((section) =>
        section.documents.filter(canShowInLightbox).map((doc) => ({
          doc,
          sectionTitle: section.title,
        }))
      ),
    ];
  }, [uniqueDocuments, extraDocumentSections, mainDocumentsTitle]);

  // Create a stable key for dependency tracking
  const imageDocumentsKey = useMemo(
    () =>
      imageDocuments
        .map((doc) => doc.dms_url?.url?.object_name || "")
        .join(","),
    [imageDocuments]
  );

  // Fetch all image URLs and cache them at this level
  useEffect(() => {
    if (!jwt || imageDocuments.length === 0) return;

    const fetchAllImages = async () => {
      const newUrls: SavedImageUrls = {};
      let hasNewUrls = false;

      for (const doc of imageDocuments) {
        const objectName = doc.dms_url?.url?.object_name;
        if (!objectName) continue;

        // Skip if already cached
        if (savedImageUrls[objectName]) {
          newUrls[objectName] = savedImageUrls[objectName];
          continue;
        }

        try {
          const url = await getDocumentBlobUrl(jwt, objectName);
          newUrls[objectName] = url;
          hasNewUrls = true;
        } catch (err) {
          console.error("Failed to load image:", err);
        }
      }

      if (hasNewUrls) {
        setSavedImageUrls((prev) => ({ ...prev, ...newUrls }));
      }
    };

    fetchAllImages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jwt, imageDocumentsKey]);

  // Label style matching FormLabel: text-sm font-medium text-gray-700
  const labelStyle: React.CSSProperties = {
    fontSize: 14,
    fontWeight: 500,
    color: "#374151",
    marginBottom: 8,
  };

  // Documents content
  // const documentsContent = (
  //   <DocumentPreview
  //     documents={documents}
  //     jwt={jwt}
  //     onFilesChange={onFilesChange}
  //     pendingFiles={pendingFiles}
  //     dokumenteTitleStyle={labelStyle}
  //     vorschauTitleStyle={labelStyle}
  //     uploadText={uploadText}
  //   />
  // );
  const hasAnyDocuments =
    uniqueDocuments.length > 0 ||
    pendingUploads.length > 0 ||
    extraDocumentSections.some((s) => s.documents.length > 0);

  const uploadProps = !readOnly
    ? {
        readOnly: false as const,
        pendingUploads,
        onAddFiles: handleAddFiles,
        onRemovePendingUpload: handleRemovePendingUpload,
        onPendingUploadNameChange: handlePendingUploadNameChange,
      }
    : {
        readOnly: true as const,
        pendingUploads,
      };

  const documentsContent = (
    <div className="flex flex-col gap-4">
      {!hasAnyDocuments && readOnly ? (
        <div>
          <div style={{ ...labelStyle }}>{mainDocumentsTitle}</div>
          <div style={{ color: "#8c8c8c", fontSize: 13, padding: "16px 0" }}>
            Keine Dateien vorhanden
          </div>
        </div>
      ) : (
        <>
          <FilePreview
            documents={uniqueDocuments}
            jwt={jwt}
            titleStyle={labelStyle}
            title={mainDocumentsTitle}
            size="xl"
            showDescription={false}
            savedImageUrls={savedImageUrls}
            allLightboxDocuments={allLightboxDocuments}
            removedDocumentKeys={removedDocumentKeys}
            onToggleRemoveDocument={onToggleRemoveDocument}
            {...uploadProps}
          />
          {extraDocumentSections
            .filter((s) => s.documents.length > 0)
            .map((section) => (
              <FilePreview
                key={section.title}
                documents={section.documents}
                jwt={jwt}
                titleStyle={labelStyle}
                title={section.title}
                size="xl"
                showDescription={false}
                savedImageUrls={savedImageUrls}
                allLightboxDocuments={allLightboxDocuments}
              />
            ))}
        </>
      )}
    </div>
  );

  // Danger zone: only when the user opted into the dangerous delete mode and a
  // delete handler is available (existing feature, editable user). Rendered at
  // the very bottom of the form column so it sits below all tabs/content.
  const dangerZone =
    dangerousDeleteMode && onDeleteFeature ? (
      <DangerZone
        title={title ? `${title} löschen` : "Fachobjekt löschen"}
        description="Das Fachobjekt wird dauerhaft aus der Datenbank entfernt."
        buttonLabel="Fachobjekt löschen"
        onConfirm={() => {
          onDeleteFeature();
        }}
      />
    ) : null;

  // Raw data tabs (only shown when ?showRaw=true / yellow mode).
  // Two separate tabs: "Feature Rohdaten" is the lightweight feature loaded
  // from the map / vector tile; "DB Rohdaten" is the full object loaded
  // separately from the database.
  const hasRawFeatureData = rawFeatureData !== undefined && rawFeatureData !== null;
  const hasDbData = debugData !== undefined && debugData !== null;
  // MapLibre's Feature class has a self-referential `geometry` getter that
  // makes JSON.stringify recurse infinitely. Snapshot only the safe GeoJSON
  // fields before stringifying.
  const rawFeatureJson = useMemo(() => {
    if (!hasRawFeatureData) return "";
    const f = rawFeatureData as {
      id?: unknown;
      type?: unknown;
      geometry?: unknown;
      properties?: unknown;
      sourceLayer?: unknown;
      source?: unknown;
      layer?: { id?: unknown };
    };
    const snapshot = {
      id: f.id,
      type: f.type,
      sourceLayer: f.sourceLayer,
      source: f.source,
      layer: f.layer ? { id: f.layer.id } : undefined,
      geometry: f.geometry,
      properties: f.properties,
    };
    try {
      return JSON.stringify(snapshot, null, 2);
    } catch {
      return JSON.stringify({ properties: f.properties, id: f.id }, null, 2);
    }
  }, [hasRawFeatureData, rawFeatureData]);
  const rawTabs = showRaw
    ? [
        ...(hasRawFeatureData
          ? [
              {
                key: "raw-feature",
                label: <span>Feature Rohdaten</span>,
                children: <RawDisplay>{rawFeatureJson}</RawDisplay>,
              },
            ]
          : []),
        ...(hasDbData
          ? [
              {
                key: "raw-db",
                label: <span>DB Rohdaten</span>,
                children: (
                  <RawDisplay>
                    {JSON.stringify(debugData, null, 2)}
                  </RawDisplay>
                ),
              },
            ]
          : []),
      ]
    : [];

  // Wide screen: two-column layout (form left, documents right)
  if (isWideScreen && !singleColumn) {
    // Build tabs for the left column - general tab (default "Allgemein"),
    // additional tabs (before or after the general tab), then raw-data tabs.
    // forceRender so the inner form components mount even when their tab is
    // inactive. The Leuchten-creation flow keeps cross-tab form refs
    // (leuchteFormRef ↔ mastFormRef) for Kennziffer/Strassenschluessel
    // mirroring; lazy-mounted tabs leave those refs null and silently drop
    // setFieldsValue calls.
    const generalTab = {
      key: "general",
      label: <span>{generalTabLabel}</span>,
      children: <>{formHeaderContent}{children}</>,
      forceRender: true,
    };
    const mappedAdditionalTabs = additionalTabs.map((tab) => ({
      key: tab.key,
      label: <span>{tab.label}</span>,
      children: tab.children,
      forceRender: true,
    }));
    const mappedExtraGeneralTabs = extraGeneralTabs.map((tab) => ({
      key: tab.key,
      label: tab.label,
      children: tab.children,
      forceRender: true,
    }));
    // "+" sentinel: anchored after the last Leuchte tab so it always trails
    // the growing list of extraGeneralTabs. Empty children — handleTabChange
    // rejects activation so this pane is never shown.
    const addTabSentinel = onAddTab
      ? [
          {
            key: ADD_TAB_KEY,
            label: (
              <span aria-label="Neue Leuchte Tab hinzufügen">
                <PlusOutlined />
              </span>
            ),
            children: null,
          },
        ]
      : [];
    const leftColumnTabs =
      additionalTabsPosition === "before"
        ? [
            ...mappedAdditionalTabs,
            generalTab,
            ...mappedExtraGeneralTabs,
            ...addTabSentinel,
            ...rawTabs,
          ]
        : [
            generalTab,
            ...mappedExtraGeneralTabs,
            ...mappedAdditionalTabs,
            ...addTabSentinel,
            ...rawTabs,
          ];

    return (
      <div className="bg-white rounded-xl border border-gray-100 w-full h-full flex flex-col">
        <FormHeader
          title={title}
          subtitle={subtitle}
          cancelLabel={cancelLabel}
          onCancel={onCancel}
          onSave={onSave}
          saving={saving}
          loading={loading || saving}
          readOnly={readOnly}
          hasDraft={hasDraft}
          onToggleReadOnly={onToggleReadOnly}
          onBack={onBack}
          isCreation={isCreation}
          customDraftsCount={customDraftsCount}
          onSaveAll={onSaveAll}
          onCreateRelatedDraft={onCreateRelatedDraft}
          createDraftButtonVariant={createDraftButtonVariant}
          onCopyValues={onCopyValues}
        />
        <div className="flex flex-1 overflow-hidden">
          {/* Form column - 60% */}
          <div
            className={`w-3/5 min-w-[400px] px-6 pb-4 overflow-y-auto border-r border-gray-100 transition-opacity ${
              saving ? "opacity-50 pointer-events-none" : ""
            }`}
          >
            {showRaw || additionalTabs.length > 0 || onCreateRelatedDraft ? (
              <div
                className="[&_.ant-tabs-nav]:sticky [&_.ant-tabs-nav]:top-0 [&_.ant-tabs-nav]:bg-white [&_.ant-tabs-nav]:z-10 [&_.ant-tabs-tab[data-node-key=addtabsentinel]]:!ml-4 [&_.ant-tabs-tab[data-node-key=addtabsentinel]+.ant-tabs-tab]:!ml-4 [&_.ant-tabs-tab[data-node-key=createdraftsentinel]]:!ml-3 [&_.ant-tabs-tab[data-node-key^=extra-]]:!ml-4 [&_.ant-tabs-tab+.ant-tabs-tab[data-node-key=general]]:!ml-4"
              >
                <Tabs
                  key={tabsResetKey}
                  activeKey={activeTabKey}
                  onChange={handleTabChange}
                  items={leftColumnTabs}
                />
              </div>
            ) : (
              <div className="pt-4">{formHeaderContent}{children}</div>
            )}
            {dangerZone}
          </div>
          {/* Documents / side column - 40% */}
          <div
            className={`w-2/5 min-w-[480px] px-6 py-4 overflow-y-auto transition-opacity ${
              saving ? "opacity-50 pointer-events-none" : ""
            }`}
          >
            {sideContent ?? documentsContent}
          </div>
        </div>
      </div>
    );
  }

  // Narrow screen: tabbed layout
  return (
    <div
      className={`bg-white rounded-xl border border-gray-100 w-full h-full flex flex-col min-w-[350px] ${
        singleColumn ? "" : "max-w-4xl"
      }`}
    >
      <FormHeader
        title={title}
        subtitle={subtitle}
        cancelLabel={cancelLabel}
        onCancel={onCancel}
        onSave={onSave}
        saving={saving}
        loading={loading || saving}
        readOnly={readOnly}
        hasDraft={hasDraft}
        onToggleReadOnly={onToggleReadOnly}
        onBack={onBack}
        isCreation={isCreation}
        customDraftsCount={customDraftsCount}
        onSaveAll={onSaveAll}
        onCreateRelatedDraft={onCreateRelatedDraft}
        createDraftButtonVariant={createDraftButtonVariant}
        onCopyValues={onCopyValues}
      />
      <div
        className={`px-6 pb-60 overflow-y-auto flex-1 transition-opacity ${
          saving ? "opacity-50 pointer-events-none" : ""
        }`}
      >
        {singleColumn && !showRaw && !onCreateRelatedDraft ? (
          <div className="pt-4">{formHeaderContent}{documentsContent}</div>
        ) : (
          <div className="[&_.ant-tabs-nav]:sticky [&_.ant-tabs-nav]:top-0 [&_.ant-tabs-nav]:bg-white [&_.ant-tabs-nav]:z-10 [&_.ant-tabs-tab[data-node-key=addtabsentinel]]:!ml-4 [&_.ant-tabs-tab[data-node-key=addtabsentinel]+.ant-tabs-tab]:!ml-4 [&_.ant-tabs-tab[data-node-key=createdraftsentinel]]:!ml-3 [&_.ant-tabs-tab[data-node-key^=extra-]]:!ml-4 [&_.ant-tabs-tab+.ant-tabs-tab[data-node-key=general]]:!ml-4">
            {singleColumn && formHeaderContent}
            {(() => {
              const narrowGeneralTab = {
                key: "general",
                label: <span>{generalTabLabel}</span>,
                children: <>{formHeaderContent}{children}</>,
                forceRender: true,
              };
              const narrowAdditionalTabs = additionalTabs.map((tab) => ({
                key: tab.key,
                label: <span>{tab.label}</span>,
                children: tab.children,
                forceRender: true,
              }));
              const narrowExtraGeneralTabs = extraGeneralTabs.map((tab) => ({
                key: tab.key,
                label: tab.label,
                children: tab.children,
                forceRender: true,
              }));
              const narrowAddTabSentinel = onAddTab && !singleColumn
                ? [
                    {
                      key: ADD_TAB_KEY,
                      label: (
                        <span aria-label="Neue Leuchte Tab hinzufügen">
                          <PlusOutlined />
                        </span>
                      ),
                      children: null,
                    },
                  ]
                : [];
              const orderedFormTabs = singleColumn
                ? []
                : additionalTabsPosition === "before"
                ? [
                    ...narrowAdditionalTabs,
                    narrowGeneralTab,
                    ...narrowExtraGeneralTabs,
                    ...narrowAddTabSentinel,
                  ]
                : [
                    narrowGeneralTab,
                    ...narrowExtraGeneralTabs,
                    ...narrowAdditionalTabs,
                    ...narrowAddTabSentinel,
                  ];
              const documentsTab = {
                key: "documents",
                label: <span>{sideContent ? "Änderungen" : "Dokumente"}</span>,
                children: sideContent ?? documentsContent,
              };
              return (
                <Tabs
                  key={tabsResetKey}
                  activeKey={singleColumn ? "documents" : activeTabKey}
                  onChange={handleTabChange}
                  items={[
                    ...orderedFormTabs,
                    documentsTab,
                    ...rawTabs,
                  ]}
                />
              );
            })()}
          </div>
        )}
        {dangerZone}
      </div>
    </div>
  );
};

export default FeatureFormLayout;
