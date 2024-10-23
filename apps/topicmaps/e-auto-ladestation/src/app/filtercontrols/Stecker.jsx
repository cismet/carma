import { faPlug } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Form } from 'react-bootstrap';

const Stecker = ({ filter, setFilter, steckertypes }) => {
  if (steckertypes) {
    return (
      <div>
        <Form>
          <div>
            Steckertypen
            {'  '}
            <FontAwesomeIcon
              icon={faPlug}
              size="2x"
              style={{
                color: 'grey',
                width: '30px',
                textAlign: 'center',
              }}
            />
          </div>
          <div>
            {steckertypes.map((typ) => {
              return (
                <div>
                  <Form.Check
                    readOnly={true}
                    key={'filter.emob.stecker.' + typ}
                    id={'filter.emob.stecker.' + typ}
                    onClick={(e) => {
                      const newFilterState = { ...filter };

                      if (filter.stecker === undefined) {
                        newFilterState.stecker = steckertypes;
                      }
                      const add = newFilterState.stecker.indexOf(typ) === -1;
                      let stecker = [...newFilterState.stecker];

                      if (add === true) {
                        stecker.push(typ);
                        newFilterState.stecker = stecker;
                      } else {
                        stecker.splice(stecker.indexOf(typ), 1);
                        newFilterState.stecker = stecker;
                      }

                      setFilter(newFilterState);
                    }}
                    checked={
                      filter.stecker === undefined ||
                      filter.stecker.indexOf(typ) !== -1
                    }
                    label={typ}
                  />
                </div>
              );
            })}
          </div>
        </Form>
        <br />
      </div>
    );
  } else {
    return null;
  }
};

export default Stecker;
