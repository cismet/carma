import { Tooltip } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconProp } from "@fortawesome/fontawesome-svg-core";

interface CarmaIconLinkProps {
  iconname?: string;
  icon?: IconProp;
  tooltip?: string;
  onClick?: () => void;
  href?: string;
  target?: string;
  style?: React.CSSProperties;
}

export const CarmaIconLink = ({
  iconname,
  icon,
  tooltip,
  onClick,
  href,
  target,
  style,
}: CarmaIconLinkProps) => {
  const iconStyle = { fontSize: "20px", color: "grey", ...style };
  const content = (
    <a
      onClick={onClick}
      href={href}
      target={target}
      style={{ padding: 0, margin: 0, lineHeight: 1, display: "inline-flex" }}
      title={tooltip}
    >
      {icon ? (
        <FontAwesomeIcon icon={icon} style={iconStyle} />
      ) : (
        <i className={`fa fa-${iconname}`} style={iconStyle} />
      )}
    </a>
  );

  return content;
};
