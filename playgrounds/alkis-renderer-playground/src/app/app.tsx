import { faLock, faUser } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Input, Form, Button } from "antd";
const { Search } = Input;

export function App() {
  const onSearch = (value: string) => {
    console.log("xxx Search text:", value.trim());
  };
  return (
    <div>
      <Form className="w-full">
        <div className="flex flex-col gap-6 w-full">
          <h3 className="text-primary border-b-2 border-0 w-fit border-solid">
            Anmeldung
          </h3>
          <Form.Item
            name="username"
            rules={[
              {
                required: true,
                message: "Bitte füge deinen Nutzernamen hinzu",
              },
            ]}
          >
            <Input
              placeholder="Nutzername"
              prefix={<FontAwesomeIcon icon={faUser} color="#E67843" />}
            />
          </Form.Item>
          <Form.Item
            name="password"
            rules={[
              {
                required: true,
                message: "Bitte füge deinen Passwort hinzu",
              },
            ]}
          >
            <Input.Password
              placeholder="Passwort"
              prefix={<FontAwesomeIcon icon={faLock} color="#E67843" />}
            />
          </Form.Item>
          <Button
            type="primary"
            size="large"
            className="w-fit"
            htmlType="submit"
          >
            Anmelden
          </Button>
        </div>
      </Form>
      <div style={{ marginTop: "40px" }}>
        <Search
          placeholder="type alkis id input"
          onSearch={onSearch}
          enterButton
        />
      </div>
    </div>
  );
}

export default App;
