interface EmptySearchComponentProps {
  pixelwidth: string | number;
}
export const EmptySearchComponent = ({
  pixelwidth = 350,
}: EmptySearchComponentProps) => {
  return (
    <div
      style={{
        width: pixelwidth,
        height: "33px",
      }}
    ></div>
  );
};
