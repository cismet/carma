import { useMemo } from "react";
import { Button, Input, Segmented } from "antd";
import { PlusOutlined } from "@ant-design/icons";

import { itemMatchesFilters, useCatalogData } from "@carma-mapping/layers";

import {
  toCatalogFilters,
  type FilterGroupDraft,
  type RouteDraft,
} from "../model";
import { useCatalogSuggestions } from "../hooks/useCatalogSuggestions";
import ExportPanel from "./ExportPanel";
import FilterGroup from "./FilterGroup";

const SectionTitle = ({ children }: { children: string }) => (
  <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
    {children}
  </h2>
);

interface ConfigSidebarProps {
  route: RouteDraft;
  onRouteChange: (route: RouteDraft) => void;
  filterGroups: FilterGroupDraft[];
  onFilterGroupsChange: (filterGroups: FilterGroupDraft[]) => void;
  previewIn3d: boolean;
  onPreviewIn3dChange: (previewIn3d: boolean) => void;
  modalOpen: boolean;
  onOpenModal: () => void;
}

const ConfigSidebar = ({
  route,
  onRouteChange,
  filterGroups,
  onFilterGroupsChange,
  previewIn3d,
  onPreviewIn3dChange,
  modalOpen,
  onOpenModal,
}: ConfigSidebarProps) => {
  const suggestions = useCatalogSuggestions();
  const { serviceCategories } = useCatalogData();

  const activeFilters = useMemo(
    () => toCatalogFilters(filterGroups),
    [filterGroups]
  );

  // quick feedback over the service-backed map layers only; discover items,
  // sensors and objects are assembled inside the catalog view
  const mapLayerStats = useMemo(() => {
    let total = 0;
    let matched = 0;
    serviceCategories.forEach((category) =>
      category.layers.forEach((layer) => {
        total += 1;
        const matches = itemMatchesFilters(
          layer as unknown as Parameters<typeof itemMatchesFilters>[0],
          activeFilters,
          { mainCategoryId: "mapLayers", subCategoryId: category.id }
        );
        if (matches) {
          matched += 1;
        }
      })
    );
    return { total, matched };
  }, [serviceCategories, activeFilters]);

  const handleAddGroup = () => {
    const nextKey =
      filterGroups.reduce((max, group) => Math.max(max, group.key), -1) + 1;
    onFilterGroupsChange([
      ...filterGroups,
      { key: nextKey, filters: [{ key: 0, field: "keywords", values: [] }] },
    ]);
  };

  return (
    <aside className="fixed inset-y-0 left-0 w-96 z-[1040] bg-white shadow-2xl flex flex-col">
      <header className="px-4 py-3 border-b border-gray-200">
        <h1 className="text-lg font-semibold mb-0">Fachzwilling-Konfigurator</h1>
        <p className="text-xs text-gray-500 mb-0">
          Links die Filter einstellen, rechts im Karteninhalte-Modal die Wirkung
          prüfen, unten die fertige Config exportieren.
        </p>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-6">
        <section className="flex flex-col gap-2">
          <SectionTitle>Route</SectionTitle>
          <Input
            addonBefore="#/"
            placeholder="gesundheit"
            value={route.path}
            onChange={(event) =>
              onRouteChange({ ...route, path: event.target.value })
            }
          />
          <Input
            placeholder="Titel"
            value={route.title}
            onChange={(event) =>
              onRouteChange({ ...route, title: event.target.value })
            }
          />
          <Input.TextArea
            rows={3}
            placeholder="Beschreibung (optional)"
            value={route.description}
            onChange={(event) =>
              onRouteChange({ ...route, description: event.target.value })
            }
          />
        </section>

        <section className="flex flex-col gap-2">
          <SectionTitle>Vorschau</SectionTitle>
          <div className="flex items-center gap-2">
            <Segmented
              value={previewIn3d ? "3d" : "2d"}
              onChange={(value) => onPreviewIn3dChange(value === "3d")}
              options={[
                { label: "2D-Modus", value: "2d" },
                { label: "3D-Modus", value: "3d" },
              ]}
            />
            {!modalOpen && (
              <Button size="small" onClick={onOpenModal}>
                Modal öffnen
              </Button>
            )}
          </div>
          <p className="text-xs text-gray-500 mb-0">
            Kartenebenen: {mapLayerStats.matched} von {mapLayerStats.total}{" "}
            sichtbar (Entdecken, Sensoren und Objekte nicht mitgezählt).
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <SectionTitle>Filter</SectionTitle>
          <p className="text-xs text-gray-500 mb-0">
            Innerhalb einer Gruppe muss ein Item jeden Filter erfüllen (UND);
            zwischen Gruppen reicht eine (ODER). Innerhalb eines Filters reicht
            einer der Werte. Zeilen ohne Werte sind inaktiv.
          </p>
          {filterGroups.map((group, index) => (
            <div key={group.key} className="flex flex-col gap-2">
              {index > 0 && (
                <div className="text-center text-xs font-semibold uppercase tracking-wider text-gray-400">
                  oder
                </div>
              )}
              <FilterGroup
                group={group}
                label={`Gruppe ${index + 1}`}
                removable={filterGroups.length > 1}
                suggestions={suggestions}
                onChange={(changed) =>
                  onFilterGroupsChange(
                    filterGroups.map((entry) =>
                      entry.key === changed.key ? changed : entry
                    )
                  )
                }
                onRemove={() =>
                  onFilterGroupsChange(
                    filterGroups.filter((entry) => entry.key !== group.key)
                  )
                }
              />
            </div>
          ))}
          <Button icon={<PlusOutlined />} onClick={handleAddGroup}>
            ODER-Gruppe hinzufügen
          </Button>
        </section>

        <section className="flex flex-col gap-2">
          <SectionTitle>Export</SectionTitle>
          <ExportPanel route={route} filters={activeFilters} />
        </section>
      </div>
    </aside>
  );
};

export default ConfigSidebar;
