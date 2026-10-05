import HeadBlock from "../heads/HeadBlock";
import { useSelector } from "react-redux";
import { getPermissionsEdit } from "../../../store/slices/permissions";
const InfoBlock = ({
  title,
  children,
  controlBar,
  titleAction,
  extraActions,
}) => {
  const isEdit = useSelector(getPermissionsEdit);
  return (
    <div
      style={{
        background: "#FFFFFF",
        borderRadius: "6px",
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <HeadBlock title={title} titleAction={titleAction}>
        {isEdit && controlBar}
        {extraActions}
      </HeadBlock>
      {children}
    </div>
  );
};

export default InfoBlock;
