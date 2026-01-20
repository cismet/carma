import { useEffect, useState, useRef, useCallback } from "react";
import { fetchAllKeyTables, keyTableFetchers } from "../../helper/apiMethods";
import { AppDispatch } from "../../store";
import { useDispatch, useSelector } from "react-redux";
import { getJWT } from "../../store/slices/auth";
import { useSyncOptional } from "@carma-providers/syncing";
import {
  setKeyTablesData,
  setKeyTablesErrors,
  setKeyTablesLoading,
  getKeyTablesData,
  getKeyTablesErrors,
  getKeyTablesLoading,
  getKeyTablesFetched,
} from "../../store/slices/keyTables";
import { Spin, Alert, Modal, message, List } from "antd";
import KeyTableDataGroups from "../ui/KeyTableDataGroups";
import KeyTableDataGroupsList from "../ui/KeyTableDataGroupsList";
import FormWrapper from "../ui/FormWrapper";
import { CustomCard } from "../commons/CustomCard";
import {
  keyTableDisplayConfig,
  apiClassNameToTableName,
} from "../../config/keyTableDisplayConfig";
import { getItemDisplayText } from "../../utils/templateParser";

interface SelectedItem {
  item: Record<string, unknown>;
  tableName: string;
}

const KeyTablesPage = () => {
  const dispatch: AppDispatch = useDispatch();
  const storedJWT = useSelector(getJWT);
  const data = useSelector(getKeyTablesData);
  const errors = useSelector(getKeyTablesErrors);
  const loading = useSelector(getKeyTablesLoading);
  const fetched = useSelector(getKeyTablesFetched);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const [isFirstColumnCollapsed, setIsFirstColumnCollapsed] = useState(false);
  const [formHasChanges, setFormHasChanges] = useState(false);
  const sync = useSyncOptional();

  // Keep refs to current data and selectedItem to avoid stale closure in Modal.confirm callback
  // Update synchronously during render (not in useEffect which runs after)
  const dataRef = useRef(data);
  dataRef.current = data;
  const selectedItemRef = useRef(selectedItem);
  selectedItemRef.current = selectedItem;
  const formHasChangesRef = useRef(formHasChanges);
  formHasChangesRef.current = formHasChanges;

  const adjustedHeight = "calc(100vh - 65px)";

  // Helper to confirm navigation when there are unsaved changes
  const confirmIfUnsavedChanges = (callback: () => void) => {
    if (formHasChangesRef.current) {
      Modal.confirm({
        title: "Ungespeicherte Änderungen",
        content:
          "Sie haben ungespeicherte Änderungen. Wenn Sie fortfahren, gehen diese verloren. Möchten Sie wirklich fortfahren?",
        okText: "Fortfahren",
        okType: "danger",
        cancelText: "Abbrechen",
        onOk: callback,
      });
    } else {
      callback();
    }
  };

  useEffect(() => {
    if (fetched) return;

    const fetchData = async () => {
      if (!storedJWT) return;

      dispatch(setKeyTablesLoading(true));
      try {
        const { data, errors } = await fetchAllKeyTables(storedJWT);
        dispatch(setKeyTablesData(data));
        dispatch(setKeyTablesErrors(errors));
      } catch (error) {
        console.error("Failed to fetch key tables:", error);
      } finally {
        dispatch(setKeyTablesLoading(false));
      }
    };
    fetchData();
  }, []);

  // Select first table by default when data loads (sorted alphabetically to match display)
  useEffect(() => {
    if (Object.keys(data).length > 0 && !selectedTable) {
      const formatTableName = (key: string) =>
        key
          .replace(/([A-Z])/g, " $1")
          .replace(/^./, (str) => str.toUpperCase())
          .trim();
      const sortedKeys = Object.keys(data).sort((a, b) =>
        formatTableName(a).localeCompare(formatTableName(b), "de", {
          sensitivity: "base",
        })
      );
      setSelectedTable(sortedKeys[0]);
    }
  }, [data]);

  // Select first item when table changes (apply sorting to match displayed order)
  useEffect(() => {
    if (selectedTable && data[selectedTable]) {
      const tableItems = data[selectedTable] as Record<string, unknown>[];
      if (Array.isArray(tableItems) && tableItems.length > 0) {
        const sortMode = keyTableDisplayConfig[selectedTable]?.sortMode;
        let sortedItems = [...tableItems];

        if (sortMode && sortMode !== "none") {
          sortedItems.sort((a, b) => {
            const aText = getItemDisplayText(
              a,
              selectedTable,
              keyTableDisplayConfig
            );
            const bText = getItemDisplayText(
              b,
              selectedTable,
              keyTableDisplayConfig
            );
            if (sortMode === "alphabetical") {
              return aText.localeCompare(bText, "de", { sensitivity: "base" });
            }
            if (sortMode === "numeric") {
              return aText.localeCompare(bText, "de", { numeric: true });
            }
            return 0;
          });
        }

        setSelectedItem({
          item: sortedItems[0],
          tableName: selectedTable,
        });
      } else {
        setSelectedItem(null);
      }
    }
  }, [selectedTable]);

  // Track processed action IDs to avoid duplicate refetches
  const processedActionIdsRef = useRef<Set<string>>(new Set());
  // Track pending refetch timers for debouncing
  const pendingRefetchTimersRef = useRef<Map<string, NodeJS.Timeout>>(
    new Map()
  );

  // Refetch a single table and update Redux
  const refetchTable = useCallback(
    async (tableName: string) => {
      if (!storedJWT) return;

      const fetcher = keyTableFetchers[tableName];
      if (!fetcher) {
        console.warn(`[CrossTabSync] No fetcher found for table: ${tableName}`);
        return;
      }

      try {
        console.log(`[CrossTabSync] Refetching table: ${tableName}`);
        const newTableData = await fetcher(storedJWT);
        const newData = { ...dataRef.current, [tableName]: newTableData };
        dispatch(setKeyTablesData(newData));
        console.log(
          `[CrossTabSync] Updated table ${tableName} with ${newTableData.length} items`
        );
      } catch (error) {
        console.error(`[CrossTabSync] Failed to refetch ${tableName}:`, error);
      }
    },
    [storedJWT, dispatch]
  );

  // Cross-tab sync: detect completed keytable actions from other tabs
  useEffect(() => {
    if (!sync?.tasks) return;

    // Find newly completed SaveObject/DeleteObject actions for keytables
    const tablesToRefetch = new Set<string>();

    sync.tasks.forEach((task) => {
      // Skip if already processed or not completed
      if (!task.isCompleted || processedActionIdsRef.current.has(task.id)) {
        return;
      }

      // Only handle keytable-related actions
      if (task.action !== "SaveObject" && task.action !== "DeleteObject") {
        processedActionIdsRef.current.add(task.id);
        return;
      }

      // Extract className from fachobjekt (format: "className #id" or just "className")
      const apiClassName = task.fachobjekt.split(" ")[0];
      const tableName = apiClassNameToTableName[apiClassName];

      if (tableName) {
        tablesToRefetch.add(tableName);
        console.log(
          `[CrossTabSync] Detected completed action ${task.id} for table: ${tableName} (className: ${apiClassName})`
        );
      }

      // Mark as processed
      processedActionIdsRef.current.add(task.id);
    });

    // Debounce refetches - if same table is triggered multiple times quickly, only fetch once
    tablesToRefetch.forEach((tableName) => {
      // Clear any existing timer for this table
      const existingTimer = pendingRefetchTimersRef.current.get(tableName);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      // Set a new debounced timer
      const timer = setTimeout(() => {
        refetchTable(tableName);
        pendingRefetchTimersRef.current.delete(tableName);
      }, 500); // 500ms debounce

      pendingRefetchTimersRef.current.set(tableName, timer);
    });

    // Cleanup function to clear pending timers
    return () => {
      pendingRefetchTimersRef.current.forEach((timer) => clearTimeout(timer));
    };
  }, [sync?.tasks, refetchTable]);

  const handleTableClick = (tableName: string) => {
    confirmIfUnsavedChanges(() => {
      setSelectedTable(tableName);
    });
  };

  const handleItemClick = (item: unknown, tableName: string) => {
    confirmIfUnsavedChanges(() => {
      setSelectedItem({ item: item as Record<string, unknown>, tableName });
    });
  };

  const handleItemSaved = (updatedItem: Record<string, unknown>) => {
    // Use ref to get fresh selectedItem value
    const currentSelectedItem = selectedItemRef.current;
    if (!currentSelectedItem) return;

    const newData = { ...dataRef.current };
    const tableData = [
      ...(newData[currentSelectedItem.tableName] as unknown[]),
    ];

    // Check if this is a temporary unsaved item (created with -Date.now())
    // Temporary IDs are very large negative numbers (like -1736441234567)
    const isNewItem = (currentSelectedItem.item.id as number) < -1000000000;

    if (isNewItem) {
      // New item - add to the list
      tableData.unshift(updatedItem);
    } else {
      // Existing item - update in place
      const index = tableData.findIndex(
        (i: unknown) => (i as Record<string, unknown>).id === updatedItem.id
      );
      if (index !== -1) {
        tableData[index] = updatedItem;
      }
    }

    newData[currentSelectedItem.tableName] = tableData;
    dispatch(setKeyTablesData(newData));

    // Select the saved item (with the new real ID)
    setSelectedItem({
      item: updatedItem,
      tableName: currentSelectedItem.tableName,
    });
  };

  const handleIdUpdated = (oldId: number, newId: number, tableName: string) => {
    // Update the item's ID in Redux state when server returns the real ID
    const newData = { ...dataRef.current };
    const tableData = [...(newData[tableName] as unknown[])];

    // Find the item with the old (temporary) ID and update it
    const index = tableData.findIndex(
      (i: unknown) => (i as Record<string, unknown>).id === oldId
    );
    if (index !== -1) {
      const item = tableData[index] as Record<string, unknown>;
      tableData[index] = { ...item, id: newId };
      newData[tableName] = tableData;
      dispatch(setKeyTablesData(newData));

      // Also update selectedItem if it's the same item
      const currentSelectedItem = selectedItemRef.current;
      if (currentSelectedItem?.item.id === oldId) {
        setSelectedItem({
          item: { ...currentSelectedItem.item, id: newId },
          tableName: currentSelectedItem.tableName,
        });
      }
    }
  };

  const handleAddItem = () => {
    if (!selectedTable) return;
    confirmIfUnsavedChanges(() => {
      const tableItems = dataRef.current[selectedTable] as Record<
        string,
        unknown
      >[];
      const templateItem = tableItems[0] || {};

      // Create new item with same shape, empty values, and temporary negative id
      const newItem: Record<string, unknown> = {};
      Object.keys(templateItem).forEach((key) => {
        newItem[key] = key === "id" ? -Date.now() : "";
      });

      // Don't add to list yet - just select the new item to show empty form
      // The item will be added to the list when saved via handleItemSaved
      setSelectedItem({ item: newItem, tableName: selectedTable });
    });
  };

  const handleRemoveItem = () => {
    if (!selectedItem || !storedJWT) return;

    const itemId = selectedItem.item.id as number;
    // Check if this is a temporary unsaved item (created with -Date.now())
    // Temporary IDs are very large negative numbers (like -1736441234567)
    // Small negative numbers like -1 could be valid database IDs
    const isTemporaryUnsavedItem = itemId < -1000000000;
    if (isTemporaryUnsavedItem) {
      // New unsaved item - select first item in the list instead
      const tableData = dataRef.current[selectedItem.tableName] as Record<
        string,
        unknown
      >[];
      if (tableData && tableData.length > 0) {
        // Apply sorting to match displayed order
        const sortMode =
          keyTableDisplayConfig[selectedItem.tableName]?.sortMode;
        let sortedItems = [...tableData];
        if (sortMode && sortMode !== "none") {
          sortedItems.sort((a, b) => {
            const aText = getItemDisplayText(
              a,
              selectedItem.tableName,
              keyTableDisplayConfig
            );
            const bText = getItemDisplayText(
              b,
              selectedItem.tableName,
              keyTableDisplayConfig
            );
            if (sortMode === "alphabetical") {
              return aText.localeCompare(bText, "de", { sensitivity: "base" });
            }
            if (sortMode === "numeric") {
              return aText.localeCompare(bText, "de", { numeric: true });
            }
            return 0;
          });
        }
        setSelectedItem({
          item: sortedItems[0],
          tableName: selectedItem.tableName,
        });
      } else {
        setSelectedItem(null);
      }
      return;
    }

    Modal.confirm({
      title: "Eintrag löschen",
      content: "Möchten Sie diesen Eintrag wirklich löschen?",
      okText: "Löschen",
      okType: "danger",
      cancelText: "Abbrechen",
      onOk: async () => {
        // Use refs to get fresh values, not stale closure
        const currentSelectedItem = selectedItemRef.current;
        if (!currentSelectedItem) return;

        try {
          const apiClassName =
            keyTableDisplayConfig[currentSelectedItem.tableName]
              ?.apiClassName || currentSelectedItem.tableName;

          // Use syncedAction to queue the delete operation for offline sync
          if (sync?.syncedAction) {
            await sync.syncedAction("DeleteObject", {
              className: apiClassName,
              data: JSON.stringify(currentSelectedItem.item),
              status: "open",
            });
            message.success("Löschaktion zur Synchronisation hinzugefügt");
          } else {
            message.error("Synchronisation nicht verfügbar");
            return;
          }

          // Remove from Redux state - use dataRef to get fresh data
          const currentItemId = currentSelectedItem.item.id as number;
          const newData = { ...dataRef.current };
          const tableData = (
            newData[currentSelectedItem.tableName] as unknown[]
          ).filter(
            (i: unknown) => (i as Record<string, unknown>).id !== currentItemId
          );
          newData[currentSelectedItem.tableName] = tableData;
          dispatch(setKeyTablesData(newData));

          // Select first SORTED item after delete (to match displayed order)
          if (tableData.length > 0) {
            const sortMode =
              keyTableDisplayConfig[currentSelectedItem.tableName]?.sortMode;
            let sortedItems = [...tableData] as Record<string, unknown>[];

            if (sortMode && sortMode !== "none") {
              sortedItems.sort((a, b) => {
                const aText = getItemDisplayText(
                  a,
                  currentSelectedItem.tableName,
                  keyTableDisplayConfig
                );
                const bText = getItemDisplayText(
                  b,
                  currentSelectedItem.tableName,
                  keyTableDisplayConfig
                );
                if (sortMode === "alphabetical") {
                  return aText.localeCompare(bText, "de", {
                    sensitivity: "base",
                  });
                }
                if (sortMode === "numeric") {
                  return aText.localeCompare(bText, "de", { numeric: true });
                }
                return 0;
              });
            }

            setSelectedItem({
              item: sortedItems[0],
              tableName: currentSelectedItem.tableName,
            });
          } else {
            setSelectedItem(null);
          }
        } catch (error) {
          console.error("Delete error:", error);
          message.error("Fehler beim Löschen");
        }
      },
    });
  };

  const selectedTableItems = selectedTable
    ? (data[selectedTable] as unknown[]) || []
    : [];

  return (
    <div className="mx-3 mt-1" style={{ overflow: "hidden" }}>
      {loading && (
        <div className="flex justify-center items-center py-8">
          <Spin size="large" tip="Laden..." />
        </div>
      )}

      {!loading && Object.keys(errors).length > 0 && (
        <Alert
          message="Fehler beim Laden"
          description={`Einige Tabellen konnten nicht geladen werden: ${Object.keys(
            errors
          ).join(", ")}`}
          type="warning"
          showIcon
          className="mb-4"
        />
      )}

      {!loading && Object.keys(data).length > 0 && (
        <div
          className="flex gap-4"
          style={{ overflowX: "auto", width: "100%" }}
        >
          {/* Column 1: Key Table Names */}
          {!isFirstColumnCollapsed && (
            <div
              style={{
                flex: "1 0 240px",
                minWidth: 240,
                height: adjustedHeight,
              }}
            >
              <KeyTableDataGroups
                data={data}
                selectedTable={selectedTable}
                onTableSelect={handleTableClick}
                onCollapse={() => setIsFirstColumnCollapsed(true)}
              />
            </div>
          )}

          {/* Column 2: Items List */}
          {selectedTable && (
            <div
              style={{
                flex: "2 0 500px",
                minWidth: 500,
                height: adjustedHeight,
              }}
            >
              <KeyTableDataGroupsList
                key={selectedTable}
                tableName={selectedTable}
                items={selectedTableItems}
                selectedItem={selectedItem}
                onItemSelect={handleItemClick}
                onAddItem={handleAddItem}
                onRemoveItem={handleRemoveItem}
                sortMode={keyTableDisplayConfig[selectedTable]?.sortMode}
                isFirstColumnCollapsed={isFirstColumnCollapsed}
                onExpandFirstColumn={() => setIsFirstColumnCollapsed(false)}
                data={data}
                onTableSelect={handleTableClick}
              />
            </div>
          )}

          {/* Column 3: Form */}
          <div
            style={{
              flex: "3 0 530px",
              minWidth: 530,
              height: adjustedHeight,
            }}
          >
            {selectedItem ? (
              <FormWrapper
                selectedItem={selectedItem}
                onSave={handleItemSaved}
                onIdUpdated={handleIdUpdated}
                readOnly={
                  keyTableDisplayConfig[selectedItem.tableName]?.readOnly
                }
                onFormHasChangesChange={setFormHasChanges}
              />
            ) : (
              <CustomCard title="" style={{ height: "100%" }}>
                <List
                  size="small"
                  dataSource={[]}
                  renderItem={() => null}
                  locale={{ emptyText: "Keine Daten" }}
                />
              </CustomCard>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default KeyTablesPage;
