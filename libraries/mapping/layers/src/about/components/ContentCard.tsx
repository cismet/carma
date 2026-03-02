interface ContentCardProps {
  children: React.ReactNode;
}

const ContentCard = ({ children }: ContentCardProps) => (
  <div
    style={{
      marginBottom: 24,
      padding: "16px 20px",
      background: "#fff",
      borderRadius: 10,
      boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
      color: "#4a5568",
      fontSize: 14,
      lineHeight: 1.7,
    }}
  >
    {children}
  </div>
);

export default ContentCard;
