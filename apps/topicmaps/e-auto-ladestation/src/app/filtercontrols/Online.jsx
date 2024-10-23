import { Form } from 'react-bootstrap';
import { faToggleOn } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

const Online = ({ filter, setFilter }) => {
  return (
    <div>
      <Form>
        <div>
          Verfügbarkeit
          {'  '}
          <FontAwesomeIcon
            icon={faToggleOn}
            size="2x"
            style={{
              color: 'grey',
              width: '30px',
              textAlign: 'center',
            }}
          />
        </div>
        <div>
          <div>
            <Form.Check
              type="radio"
              readOnly={true}
              id={'filter.emob.online.only'}
              label="nur verfügbare Ladestationen (online)"
              onClick={(e) => {
                const newFilterState = { ...filter };
                newFilterState.nur_online = e.target.checked;
                setFilter(newFilterState);
              }}
              checked={filter?.nur_online === true}
            />
          </div>
          <div>
            <Form.Check
              type="radio"
              readOnly={true}
              id={'filter.emob.online.all'}
              label="alle Ladestationen"
              onClick={(e) => {
                const newFilterState = { ...filter };
                newFilterState.nur_online = !e.target.checked;
                setFilter(newFilterState);
              }}
              checked={filter?.nur_online === false}
            />
          </div>
        </div>
      </Form>
      <br />
    </div>
  );
};

export default Online;
