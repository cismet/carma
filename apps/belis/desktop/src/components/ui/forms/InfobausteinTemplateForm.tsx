import { useEffect, useState, useCallback, useRef } from "react";
import { Form, Input, Table, Button, Checkbox } from "antd";
import type { FormInstance } from "antd";
import type { ColumnsType } from "antd/es/table";
import { PlusOutlined, MinusOutlined } from "@ant-design/icons";

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
  onFormReady?: (form: FormInstance) => void;
  onValuesChange?: (hasChanges: boolean) => void;
  disabled?: boolean;
  jwt?: string;
}

const getInitialTableData = (item: Record<string, unknown>): Infobaustein[] => {
  const arBausteineArray = item.ar_bausteineArray as ArBausteinItem[] | undefined;
  if (arBausteineArray) {
    return arBausteineArray.map((item) => item.infobaustein);
  }
  return [];
};

const InfobausteinTemplateForm = ({
  item,
  onSave,
  onFormReady,
  onValuesChange,
  disabled = false,
}: InfobausteinTemplateFormProps) => {
  const [form] = Form.useForm();
  const [tableData, setTableData] = useState<Infobaustein[]>(() =>
    getInitialTableData(item)
  );
  const [selectedRowKey, setSelectedRowKey] = useState<number | null>(null);
  const resetTableDataRef = useRef<() => void>();

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
      const data = arBausteineArray.map((item) => item.infobaustein);
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
    const updatedArBausteineArray = tableData.map((baustein) => ({
      infobaustein: baustein,
    }));
    onSave({
      ...values,
      id: item.id,
      ar_bausteineArray: updatedArBausteineArray,
    });
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
      disabled={disabled}
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
          scroll={{ y: 300 }}
          rowClassName={(record) =>
            selectedRowKey === record.id ? "selected-row" : ""
          }
          onRow={(record) => ({
            onClick: () => setSelectedRowKey(record.id),
          })}
        />
      </div>
    </Form>
  );
};

export default InfobausteinTemplateForm;
