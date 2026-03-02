interface FilterBadgeProps {
  filteredCount: number;
  totalCount: number;
}

const FilterBadge = ({ filteredCount, totalCount }: FilterBadgeProps) => {
  if (filteredCount === totalCount) return null;

  return (
    <div style={{ marginBottom: 20 }}>
      <span
        style={{
          display: "inline-block",
          fontSize: 13,
          fontWeight: 600,
          padding: "4px 12px",
          borderRadius: 12,
          backgroundColor: "#ebf4ff",
          color: "#3182ce",
        }}
      >
        {filteredCount} von {totalCount} Layern angezeigt
      </span>
    </div>
  );
};

export default FilterBadge;
