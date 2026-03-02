import Badge from "./Badge";

interface CategoryCardProps {
  title: string;
  layerCount?: number;
  children: React.ReactNode;
}

const CategoryCard = ({ title, layerCount, children }: CategoryCardProps) => (
  <div
    style={{
      marginBottom: 24,
      background: "#fff",
      borderRadius: 10,
      boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
      overflow: "hidden",
    }}
  >
    <h2
      style={{
        margin: 0,
        padding: "16px 20px",
        fontSize: 18,
        fontWeight: 700,
        borderBottom: "1px solid #edf2f7",
        color: "#2d3748",
      }}
    >
      {title}
      {layerCount !== undefined && (
        <Badge size="medium" style={{ marginLeft: 10 }}>
          {layerCount} Layer
        </Badge>
      )}
    </h2>
    {children}
  </div>
);

export default CategoryCard;
