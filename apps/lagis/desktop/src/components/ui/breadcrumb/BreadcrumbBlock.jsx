import PropTypes from "prop-types";
import { Breadcrumb } from "antd";
const BreadcrumbBlock = ({
  paths = [{ title: "Kassenzeichen", href: "" }],
}) => {
  const items = [
    {
      title: "LagIS",
    },
  ].concat(paths);
  const decorCircle = "●";
  const decor = "/";
  return (
    <Breadcrumb
      separator={decorCircle}
      items={items}
      style={{
        padding: "0.3rem 0.8rem",
        background: "white",
        borderRadius: "2px",
        width: "max-content",
      }}
    />
  );
};

export default BreadcrumbBlock;
BreadcrumbBlock.propTypes = {
  paths: PropTypes.arrayOf(
    PropTypes.shape({
      title: PropTypes.string.isRequired,
      href: PropTypes.string.isRequired,
    })
  ),
};

BreadcrumbBlock.defaultProps = {
  paths: [{ title: "Kassenzeichen", href: "" }],
};
