interface RadioSelectorProps {
  options: { label: string; value: string }[];
  value: string;
  onChange: (value: string) => void;
}

export function RadioSelector({
  options,
  value,
  onChange,
}: RadioSelectorProps) {
  return options.map((option, index) => (
    <label htmlFor={option.label} key={index}>
      <input
        type="radio"
        id={index.toString()}
        value={option.value}
        checked={value === option.value}
        onChange={(e) => onChange(e.target.value)}
      />
      {option.label}
    </label>
  ));
}

export default RadioSelector;
