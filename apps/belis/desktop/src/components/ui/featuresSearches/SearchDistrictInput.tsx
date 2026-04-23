import { Form, Select } from "antd";
import { useSelector } from "react-redux";
import { getKeyTablesData } from "../../../store/slices/keyTables";
import toTitleCase from "../../../helper/toTitleCase";

interface BezirkItem {
  id: number;
  pk?: string;
  bezirk?: string;
}

interface SearchDistrictInputProps {
  onChange: (value: number | undefined) => void;
}

const FormLabel = ({ children }: { children: React.ReactNode }) => (
  <span className="text-sm font-medium text-gray-700">{children}</span>
);

const SearchDistrictInput = ({ onChange }: SearchDistrictInputProps) => {
  const keyTablesData = useSelector(getKeyTablesData);

  const bezirkOptions = [
    ...((keyTablesData.bezirk || []) as BezirkItem[]),
  ].sort((a, b) => (a.bezirk || "").localeCompare(b.bezirk || ""));

  return (
    <Form.Item label={<FormLabel>Stadtbezirk</FormLabel>} className="mb-3">
      <Select
        placeholder="Stadtbezirk auswählen"
        className="w-full"
        allowClear
        showSearch
        optionFilterProp="children"
        onChange={(value) => onChange(value as number | undefined)}
      >
        {bezirkOptions.map((item) => (
          <Select.Option key={item.id} value={item.id}>
            {toTitleCase(item.bezirk || "")}
          </Select.Option>
        ))}
      </Select>
    </Form.Item>
  );
};

export default SearchDistrictInput;
