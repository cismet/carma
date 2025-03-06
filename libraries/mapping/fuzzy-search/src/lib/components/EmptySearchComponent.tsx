interface EmptySearchComponentProps {
  pixelwidth: string | number;
}
export const EmptySearchComponent = ({
  pixelwidth = 350,
}: EmptySearchComponentProps) => {
  return (
    <div
      style={{
        width: "1px",
        height: "33px",
        pointerEvents: "none",
      }}
    ></div>
  );
};
