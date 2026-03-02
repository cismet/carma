const baseStyle: React.CSSProperties = {
  display: "inline-block",
  fontWeight: 600,
  borderRadius: 10,
  backgroundColor: "#e8ecf1",
  color: "#4a5568",
};

const sizes = {
  small: { fontSize: 10, padding: "1px 6px" },
  default: { fontSize: 11, padding: "2px 8px" },
  medium: { fontSize: 12, padding: "4px 12px" },
} as const;

interface BadgeProps {
  children: React.ReactNode;
  size?: keyof typeof sizes;
  bg?: string;
  color?: string;
  style?: React.CSSProperties;
}

const Badge = ({
  children,
  size = "default",
  bg,
  color,
  style,
}: BadgeProps) => (
  <span
    style={{
      ...baseStyle,
      ...sizes[size],
      ...(bg ? { backgroundColor: bg } : {}),
      ...(color ? { color } : {}),
      ...style,
    }}
  >
    {children}
  </span>
);

export default Badge;
