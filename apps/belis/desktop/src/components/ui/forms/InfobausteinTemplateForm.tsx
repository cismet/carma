import { useEffect, useState, useCallback, useRef } from "react";
import { Form, Input, Table, Button, Checkbox, message } from "antd";
import FormActionButtons from "../FormActionButtons";
import type { FormInstance } from "antd";
import type { ColumnsType } from "antd/es/table";
import { PlusOutlined, MinusOutlined } from "@ant-design/icons";
import { useSyncOptional } from "@carma-providers/syncing";
import {
  saveKeyTableItem,
  TEMP_ID_THRESHOLD,
} from "../../../helper/syncHelper";

interface Infobaustein {
  id: number;
  schluessel: string;
  bezeichnung: string;
  wert: string | null;
  pflichtfeld: boolean | null;
}

interface ArBausteinItem {
  infobaustein: Infobaustein;
}

interface InfobausteinTemplateFormProps {
  item: Record<string, unknown>;
  tableName: string;
  onSave: (updatedItem: Record<string, unknown>) => void;
  onIdUpdated?: (oldId: number, newId: number, tableName: string) => void;
  onFormReady?: (form: FormInstance) => void;
  onValuesChange?: (hasChanges: boolean) => void;
  disabled?: boolean;
  jwt?: string;
  formHasChanges?: boolean;
  onReset?: () => void;
  hideButtons?: boolean;
}

const getInitialTableData = (item: Record<string, unknown>): Infobaustein[] => {
  const arBausteineArray = item.ar_bausteineArray as
    | ArBausteinItem[]
    | undefined;
  if (arBausteineArray) {
    return arBausteineArray.map((item) => item.infobaustein);
  }
  return [];
};

const InfobausteinTemplateForm = ({
  item,
  tableName,
  onSave,
  onIdUpdated,
  onFormReady,
  onValuesChange,
  disabled = false,
  jwt,
  formHasChanges = false,
  onReset,
  hideButtons = false,
}: InfobausteinTemplateFormProps) => {
  const [form] = Form.useForm();
  const [pendingConfirmation, setPendingConfirmation] = useState(false);
  const sync = useSyncOptional();
  const [tableData, setTableData] = useState<Infobaustein[]>(() =>
    getInitialTableData(item)
  );
  const [selectedRowKey, setSelectedRowKey] = useState<number | null>(null);
  const resetTableDataRef = useRef<() => void>();

  // Reset pending state when ID becomes positive (server confirmed)
  useEffect(() => {
    if ((item.id as number) > 0) {
      setPendingConfirmation(false);
    }
  }, [item.id]);

  const resetTableData = useCallback(() => {
    setTableData(getInitialTableData(item));
    setSelectedRowKey(null);
  }, [item]);

  resetTableDataRef.current = resetTableData;

  useEffect(() => {
    if (onFormReady) {
      const originalResetFields = form.resetFields.bind(form);
      const wrappedForm = {
        ...form,
        resetFields: (...args: Parameters<FormInstance["resetFields"]>) => {
          originalResetFields(...args);
          resetTableDataRef.current?.();
        },
      } as FormInstance;
      onFormReady(wrappedForm);
    }
  }, [form, onFormReady]);

  useEffect(() => {
    const arBausteineArray = item.ar_bausteineArray as
      | ArBausteinItem[]
      | undefined;
    if (arBausteineArray) {
      const data = arBausteineArray.map((item) => ({
        ...item.infobaustein,
        // Server sometimes returns "null" string instead of null - convert it back
        wert: item.infobaustein.wert === "null" ? null : item.infobaustein.wert,
        bezeichnung: item.infobaustein.bezeichnung === "null" ? null : item.infobaustein.bezeichnung,
      }));
      setTableData(data);
    }
  }, [item]);

  const handleValuesChange = () => {
    if (onValuesChange) {
      const currentValues = form.getFieldsValue();
      const hasChanges =
        currentValues.schluessel !== item.schluessel ||
        currentValues.bezeichnung !== item.bezeichnung;
      onValuesChange(hasChanges);
    }
  };

  const handleSave = (values: Record<string, unknown>) => {
    if (!jwt) {
      message.error("Nicht authentifiziert");
      return;
    }

    // Get original IDs from the item prop to identify which bausteine are truly new
    const originalBausteinIds = new Set(
      ((item.ar_bausteineArray as ArBausteinItem[] | undefined) || []).map(
        (b) => b.infobaustein.id
      )
    );

    const updatedArBausteineArray = tableData.map((baustein) => ({
      infobaustein: {
        ...baustein,
        // Only use -1 for items that don't exist in the original data (truly new items)
        // Items with temp IDs that exist in originalBausteinIds have already been saved
        id: originalBausteinIds.has(baustein.id) ? baustein.id : -1,
      },
    }));

    const itemWithTableData = {
      ...item,
      ar_bausteineArray: updatedArBausteineArray,
    };

    const result = saveKeyTableItem({
      item: itemWithTableData,
      values: {
        ...values,
        ar_bausteineArray: updatedArBausteineArray,
      },
      tableName,
      sync,
      onIdUpdated,
    });

    if (result.success) {
      message.success("Aktion zur Synchronisation hinzugefügt");
      onSave(result.savedItem);

      if (result.isNewItem) {
        setPendingConfirmation(true);
      }

      onValuesChange?.(false);
    } else {
      message.error(result.error || "Fehler beim Speichern");
    }
  };

  const handleAddRow = () => {
    const newId = -Date.now();
    const newRow: Infobaustein = {
      id: newId,
      schluessel: String(tableData.length + 1),
      bezeichnung: "",
      wert: null,
      pflichtfeld: false,
    };
    setTableData([...tableData, newRow]);
    if (onValuesChange) {
      onValuesChange(true);
    }
  };

  const handleRemoveRow = () => {
    if (selectedRowKey !== null) {
      setTableData(tableData.filter((row) => row.id !== selectedRowKey));
      setSelectedRowKey(null);
      if (onValuesChange) {
        onValuesChange(true);
      }
    }
  };

  const handleCellChange = (
    id: number,
    field: keyof Infobaustein,
    value: string | boolean | null
  ) => {
    setTableData(
      tableData.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
    if (onValuesChange) {
      onValuesChange(true);
    }
  };

  const columns: ColumnsType<Infobaustein> = [
    {
      title: "Schlüssel",
      dataIndex: "schluessel",
      key: "schluessel",
      width: 120,
      render: (text: string, record: Infobaustein) => (
        <Input
          value={text}
          onChange={(e) =>
            handleCellChange(record.id, "schluessel", e.target.value)
          }
          disabled={disabled}
          size="small"
        />
      ),
    },
    {
      title: "Bezeichnung",
      dataIndex: "bezeichnung",
      key: "bezeichnung",
      render: (text: string, record: Infobaustein) => (
        <Input
          value={text}
          onChange={(e) =>
            handleCellChange(record.id, "bezeichnung", e.target.value)
          }
          disabled={disabled}
          size="small"
        />
      ),
    },
    {
      title: "Wert",
      dataIndex: "wert",
      key: "wert",
      render: (text: string | null, record: Infobaustein) => (
        <Input
          value={text || ""}
          onChange={(e) =>
            handleCellChange(record.id, "wert", e.target.value || null)
          }
          disabled={disabled}
          size="small"
        />
      ),
    },
    {
      title: "Pflichtfeld",
      dataIndex: "pflichtfeld",
      key: "pflichtfeld",
      width: 100,
      align: "center",
      render: (value: boolean | null, record: Infobaustein) => (
        <Checkbox
          checked={!!value}
          onChange={(e) =>
            handleCellChange(record.id, "pflichtfeld", e.target.checked)
          }
          disabled={disabled}
        />
      ),
    },
  ];

  return (
    <Form
      form={form}
      initialValues={item}
      onFinish={handleSave}
      onValuesChange={handleValuesChange}
      layout="vertical"
      style={{ padding: "8px 0" }}
      disabled={disabled || pendingConfirmation}
    >
      <Form.Item
        name="schluessel"
        label={
          <span style={{ fontSize: 14, fontWeight: 400, color: "#8c8c8c" }}>
            Schlüssel
          </span>
        }
        style={{ marginBottom: 16 }}
      >
        <Input />
      </Form.Item>

      <Form.Item
        name="bezeichnung"
        label={
          <span style={{ fontSize: 14, fontWeight: 400, color: "#8c8c8c" }}>
            Bezeichnung
          </span>
        }
        style={{ marginBottom: 16 }}
      >
        <Input />
      </Form.Item>

      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <Button
            icon={<PlusOutlined />}
            onClick={handleAddRow}
            disabled={disabled}
            size="small"
          />
          <Button
            icon={<MinusOutlined />}
            onClick={handleRemoveRow}
            disabled={disabled || selectedRowKey === null}
            size="small"
          />
        </div>
        <style>
          {`
            .infobaustein-table .ant-table-row.selected-row > td {
              background-color: #e6f4ff !important;
            }
            .infobaustein-table .ant-table-row {
              cursor: pointer;
            }
          `}
        </style>
        <Table
          className="infobaustein-table"
          columns={columns}
          dataSource={tableData}
          rowKey="id"
          size="small"
          pagination={false}
          scroll={{ y: 800 }}
          rowClassName={(record) =>
            selectedRowKey === record.id ? "selected-row" : ""
          }
          onRow={(record) => ({
            onClick: () => setSelectedRowKey(record.id),
          })}
        />
      </div>
      {/* {!disabled && !hideButtons && (
        <FormActionButtons formHasChanges={formHasChanges} onReset={onReset} />
      )} */}
    </Form>
  );
};

export default InfobausteinTemplateForm;
