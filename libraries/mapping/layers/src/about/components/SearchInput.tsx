interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

const SearchInput = ({
  value,
  onChange,
  placeholder = "Filtern...",
}: SearchInputProps) => (
  <input
    type="text"
    placeholder={placeholder}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    style={{
      width: "100%",
      padding: "10px 16px",
      marginBottom: 24,
      fontSize: 14,
      border: "1px solid #e2e8f0",
      borderRadius: 8,
      boxSizing: "border-box",
      boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
      outline: "none",
      transition: "border-color 0.2s, box-shadow 0.2s",
    }}
    onFocus={(e) => {
      e.currentTarget.style.borderColor = "#667eea";
      e.currentTarget.style.boxShadow = "0 0 0 3px rgba(102,126,234,0.15)";
    }}
    onBlur={(e) => {
      e.currentTarget.style.borderColor = "#e2e8f0";
      e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.06)";
    }}
  />
);

export default SearchInput;
