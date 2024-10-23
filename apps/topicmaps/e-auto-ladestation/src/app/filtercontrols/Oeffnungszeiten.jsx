import { Form } from 'react-bootstrap';
import { faClock } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

const Oeffnungszeiten = ({ filter, setFilter }) => {
  return (
    <div>
      <Form>
        <div>
          Öffnungszeiten
          {'  '}
          <FontAwesomeIcon
            icon={faClock}
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
              id={'filter.emob.open.24/7'}
              onClick={(e) => {
                const newFilterState = { ...filter };
                if (e.target.checked) {
                  newFilterState.oeffnungszeiten = '24';
                } else {
                  newFilterState.oeffnungszeiten = '*';
                }
                setFilter(newFilterState);
              }}
              checked={filter.oeffnungszeiten === '24'}
              label="24/7"
            />
          </div>
          <div>
            <Form.Check
              type="radio"
              readOnly={true}
              id={'filter.emob.open.*'}
              onClick={(e) => {
                const newFilterState = { ...filter };
                if (e.target.checked) {
                  newFilterState.oeffnungszeiten = '*';
                } else {
                  newFilterState.oeffnungszeiten = '24';
                }
                setFilter(newFilterState);
              }}
              checked={filter.oeffnungszeiten === '*'}
              label="alle Ladestationen"
            />
          </div>
        </div>
      </Form>
      <br />
    </div>
  );
};

export default Oeffnungszeiten;
