interface ResetButtonProps {
  label: string;
  onReset: () => void;
  // Nothing to reset: already the default.
  isDefault?: boolean;
}

const ResetButton = ({
  label,
  onReset,
  isDefault = false,
}: ResetButtonProps) => (
  <button
    type="button"
    disabled={isDefault}
    onClick={onReset}
    title={isDefault ? `${label} (bereits Standard)` : undefined}
    className="flex items-center bg-transparent border-none cursor-pointer p-0 text-[#6B7280] hover:text-[#4B5563] disabled:text-gray-300 disabled:cursor-not-allowed"
  >
    {label}
  </button>
);

export default ResetButton;
