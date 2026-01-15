import { Input } from "antd";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export const SearchInput = ({
  value,
  onChange,
  placeholder = "Filtern...",
}: SearchInputProps) => {
  return (
    <Input
      placeholder={placeholder}
      size="small"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      // style={{ width: 120 }}
      allowClear
    />
  );
};
