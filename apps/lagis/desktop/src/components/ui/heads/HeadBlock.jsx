import { MenuOutlined } from "@ant-design/icons";

const SPERRE_COLORS = { border: "#FFE58F", background: "#FFFBE6" };
const EDIT_COLORS = { border: "#B7EB8F", background: "#F6FFED" };

const HeadBlock = ({
  title,
  children,
  titleAction,
  editable = false,
  locked = false,
}) => {
  const colors = locked ? SPERRE_COLORS : editable ? EDIT_COLORS : undefined;
  return (
    <div
      className="flex flex-wrap justify-between items-center px-3"
      style={{
        border: `1px solid ${colors?.border ?? "transparent"}`,
        borderBottomColor: colors?.border ?? "#C4C4C4",
        backgroundColor: colors?.background ?? "#FFFFFF",
        borderRadius: "6px 6px 0 0",
      }}
    >
      <MenuOutlined style={{ fontSize: "14px" }} />
      <h3
        className="mr-auto my-3 text-left ml-3 mr-3 text-base"
        style={{ color: "#474747" }}
      >
        {title}
      </h3>
      {titleAction && titleAction}
      <div className="my-1"> {children}</div>
    </div>
  );
};

export default HeadBlock;
