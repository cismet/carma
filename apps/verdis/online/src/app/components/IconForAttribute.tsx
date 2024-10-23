import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

const IconForAttribute = ({ iconAttributeMap, value }) => {
  return (
    <span>
      {value !== undefined && (
        <FontAwesomeIcon icon={iconAttributeMap[value]} />
      )}
    </span>
  );
};

export default IconForAttribute;
