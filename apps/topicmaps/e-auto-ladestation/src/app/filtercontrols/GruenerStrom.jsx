import { faLeaf } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Form } from 'react-bootstrap';

const GruenerStrom = ({ filter, setFilter }) => {
  return (
    <div>
      <Form>
        <div>
          Ökostrom
          {'  '}
          <FontAwesomeIcon
            icon={faLeaf}
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
              id={'filter.emob.green.only'}
              onClick={(e) => {
                const newFilterState = { ...filter };
                newFilterState.nur_gruener_strom = e.target.checked;
                setFilter(newFilterState);
              }}
              checked={filter.nur_gruener_strom === true}
              label="nur Ökostrom-Ladestationen"
            />
          </div>
          <div>
            <Form.Check
              type="radio"
              readOnly={true}
              id={'filter.emob.green.all'}
              onClick={(e) => {
                const newFilterState = { ...filter };
                newFilterState.nur_gruener_strom = !e.target.checked;
                setFilter(newFilterState);
              }}
              checked={filter.nur_gruener_strom === false}
              label="alle Ladestationen"
            />
          </div>
        </div>
      </Form>
      <br />
    </div>
  );
};

export default GruenerStrom;
