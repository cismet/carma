import { Select } from "antd";
import { useSelector } from "react-redux";
import { getKeyTablesData } from "../../../store/slices/keyTables";
import { FormItem } from "./DraftFieldHighlight";
import { getPlaceholder } from "./readOnlyFormUtils";
import toTitleCase from "../../../helper/toTitleCase";

interface BezirkItem {
  id: number;
  pk?: string;
  bezirk?: string;
}

interface StadtbezirkFieldProps {
  namePrefix?: string;
  readOnly?: boolean;
  label?: string;
  /** When true (default), field is locked/non-editable. When false, behaves like a normal editable Select. */
  locked?: boolean;
}

const FormLabel = ({ children }: { children: React.ReactNode }) => (
  <span className="text-sm font-medium text-gray-700">{children}</span>
);

const StadtbezirkField = ({
  namePrefix,
  readOnly = true,
  label = "Stadtbezirk",
  locked = true,
}: StadtbezirkFieldProps) => {
  const keyTablesData = useSelector(getKeyTablesData);

  const bezirkOptions = [
    ...((keyTablesData.bezirk || []) as BezirkItem[]),
  ].sort((a, b) => (a.bezirk || "").localeCompare(b.bezirk || ""));

  const fieldName = (name: string) => (namePrefix ? [namePrefix, name] : name);

  const field = (
    <FormItem
      name={fieldName("fk_stadtbezirk")}
      label={<FormLabel>{label}</FormLabel>}
      className="mb-4"
    >
      <Select
        placeholder={getPlaceholder(readOnly, "Stadtbezirk auswählen")}
        className="w-full"
        size="large"
        showSearch
        optionFilterProp="children"
        allowClear={!locked}
      >
        {bezirkOptions.map((item) => (
          <Select.Option key={item.id} value={item.id}>
            {toTitleCase(item.bezirk || "")}
          </Select.Option>
        ))}
      </Select>
    </FormItem>
  );

  if (!locked) {
    return field;
  }

  return (
    <div className="cursor-not-allowed">
      <div className="pointer-events-none">{field}</div>
    </div>
  );
};

export default StadtbezirkField;
