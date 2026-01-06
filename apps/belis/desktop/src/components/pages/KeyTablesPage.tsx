import { useEffect, useRef, useState } from "react";
import TopNavbar from "../commons/TopNavbar";
import { fetchAllKeyTables } from "../../helper/apiMethods";
import { AppDispatch } from "../../store";
import { useDispatch, useSelector } from "react-redux";
import { getJWT } from "../../store/slices/auth";
import {
  setKeyTablesData,
  setKeyTablesErrors,
  setKeyTablesLoading,
  getKeyTablesData,
  getKeyTablesErrors,
  getKeyTablesLoading,
  getKeyTablesFetched,
} from "../../store/slices/keyTables";
import { Collapse, List, Spin, Alert, Card } from "antd";
import KeyTableItemForm from "../ui/KeyTableItemForm";

const { Panel } = Collapse;

interface SelectedItem {
  item: Record<string, unknown>;
  tableName: string;
}

const KeyTablesPage = () => {
  const refUpperToolbar = useRef(null);
  const dispatch: AppDispatch = useDispatch();
  const storedJWT = useSelector(getJWT);
  const data = useSelector(getKeyTablesData);
  const errors = useSelector(getKeyTablesErrors);
  const loading = useSelector(getKeyTablesLoading);
  const fetched = useSelector(getKeyTablesFetched);
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);

  useEffect(() => {
    if (fetched) return;

    const fetchData = async () => {
      if (!storedJWT) return;

      dispatch(setKeyTablesLoading(true));
      try {
        const { data, errors } = await fetchAllKeyTables(storedJWT);
        dispatch(setKeyTablesData(data));
        dispatch(setKeyTablesErrors(errors));
        console.log("data", data);
        console.log("errors", errors);
      } catch (error) {
        console.error("Failed to fetch key tables:", error);
      } finally {
        dispatch(setKeyTablesLoading(false));
      }
    };
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Format table name for display
  const formatTableName = (key: string) => {
    return key
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase())
      .trim();
  };

  const handleItemClick = (item: unknown, tableName: string) => {
    setSelectedItem({ item: item as Record<string, unknown>, tableName });
  };

  const handleItemSaved = (updatedItem: Record<string, unknown>) => {
    if (!selectedItem) return;

    const newData = { ...data };
    const tableData = [...(newData[selectedItem.tableName] as unknown[])];
    const index = tableData.findIndex(
      (i: unknown) => (i as Record<string, unknown>).id === updatedItem.id
    );
    if (index !== -1) {
      tableData[index] = updatedItem;
      newData[selectedItem.tableName] = tableData;
      dispatch(setKeyTablesData(newData));
    }
    setSelectedItem(null);
  };

  return (
    <>
      <TopNavbar innerRef={refUpperToolbar} />
      <div className="mx-3 mt-1">
        <style>{`
          .key-tables-collapse .ant-collapse-item {
            border-bottom: none !important;
          }
          .key-tables-collapse .ant-collapse-item:last-child {
            border-bottom: none !important;
          }
        `}</style>
        <h1 className="text-2xl font-bold mb-4">Schlüsseltabellen</h1>

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
          <div className="flex gap-4">
            <div
              style={{
                flex: selectedItem ? "0 0 40%" : "1",
                border: "1px solid #d9d9d9",
                borderRadius: "4px",
                overflow: "auto",
                maxHeight: "calc(100vh - 200px)",
              }}
            >
              <Collapse
                bordered={false}
                expandIconPosition="start"
                style={{ background: "#fff" }}
                className="key-tables-collapse"
              >
                {Object.entries(data).map(([key, items]) => (
                  <Panel
                    header={
                      <span>
                        <strong>{formatTableName(key)}</strong>
                        <span style={{ marginLeft: 8, color: "#8c8c8c" }}>
                          ({Array.isArray(items) ? items.length : 0})
                        </span>
                      </span>
                    }
                    key={key}
                  >
                    <List
                      size="small"
                      dataSource={Array.isArray(items) ? items : []}
                      renderItem={(item: any) => (
                        <List.Item
                          style={{ paddingLeft: 24, cursor: "pointer" }}
                          className="hover:bg-gray-100"
                          onClick={() => handleItemClick(item, key)}
                        >
                          {item.bezeichnung ||
                            item.name ||
                            item.pk ||
                            item.groesse ||
                            item.lichtfarbe ||
                            item.unterhalt_mast ||
                            item.unterhaltspflichtiger_leuchte ||
                            item.strasse ||
                            item.energielieferant ||
                            item.bezirk ||
                            item.beschreibung ||
                            item.kennziffer ||
                            item.mastart ||
                            item.klassifizierung ||
                            JSON.stringify(item)}
                        </List.Item>
                      )}
                      locale={{ emptyText: "Keine Daten" }}
                    />
                  </Panel>
                ))}
              </Collapse>
            </div>

            {selectedItem && (
              <div
                style={{
                  flex: "0 0 58%",
                  maxHeight: "calc(100vh - 200px)",
                  overflow: "auto",
                }}
              >
                <Card title={formatTableName(selectedItem.tableName)}>
                  <KeyTableItemForm
                    item={selectedItem.item}
                    tableName={selectedItem.tableName}
                    onSave={handleItemSaved}
                    onCancel={() => setSelectedItem(null)}
                  />
                </Card>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
};

export default KeyTablesPage;
