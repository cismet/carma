import { Input } from "antd";
import { CloseCircleFilled } from "@ant-design/icons";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export const SearchInput = ({
  value,
  onChange,
  placeholder = "Suchen...",
}: SearchInputProps) => {
  return (
    <Input
      placeholder={placeholder}
      size="small"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ width: 120 }}
      suffix={
        value ? (
          <CloseCircleFilled
            style={{ color: "#bfbfbf", cursor: "pointer" }}
            onClick={() => onChange("")}
          />
        ) : null
      }
    />
  );
};
