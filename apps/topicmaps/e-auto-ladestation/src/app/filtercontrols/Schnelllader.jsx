import { faSuperpowers } from '@fortawesome/free-brands-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Form } from 'react-bootstrap';

const Schnelllader = ({ filter, setFilter }) => {
  return (
    <div>
      <Form>
        <div>
          Schnelllader
          {'  '}
          <FontAwesomeIcon
            icon={faSuperpowers}
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
              id={'filter.prbr.bandr'}
              onClick={(e) => {
                const newFilterState = { ...filter };
                newFilterState.nur_schnelllader = e.target.checked;
                setFilter(newFilterState);
              }}
              checked={filter.nur_schnelllader === true}
              label="nur Schnelllader"
            />
          </div>
          <div>
            <Form.Check
              type="radio"
              readOnly={true}
              id={'filter.prbr.pandr'}
              onClick={(e) => {
                const newFilterState = { ...filter };
                newFilterState.nur_schnelllader = !e.target.checked;
                setFilter(newFilterState);
              }}
              checked={filter.nur_schnelllader === false}
              label="alle Ladestationen"
            />
          </div>
        </div>
      </Form>
      <br />
    </div>
  );
};

export default Schnelllader;
