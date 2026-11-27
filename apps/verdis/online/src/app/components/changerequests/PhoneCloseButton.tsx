interface PhoneCloseButtonProps {
  onClick: () => void;
}

const PhoneCloseButton = ({ onClick }: PhoneCloseButtonProps) => {
  return (
    <button
      type="button"
      className="phone-close-button"
      aria-label="Schließen"
      onClick={onClick}
    >
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <path
          d="M3.5 3.5 12.5 12.5M12.5 3.5 3.5 12.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
};

export default PhoneCloseButton;
