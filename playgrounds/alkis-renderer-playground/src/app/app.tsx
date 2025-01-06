import { faLock, faUser } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { FormProps } from "antd";
import { Input, Form, Button } from "antd";
const { Search } = Input;

type FieldType = {
  username?: string;
  password?: string;
};

export function App() {
  const onSearch = (value: string) => {
    console.log("xxx Search text:", value.trim());
  };
  const onFinish: FormProps<FieldType>["onFinish"] = (values) => {
    console.log("xxx Success:", values);
    login(values);
  };
  return (
    <div>
      <Form className="w-full" onFinish={onFinish}>
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

export const REST_SERVICE = "https://verdis-api.cismet.de";
const DOMAIN = "VERDIS_GRUNDIS";

const login = (values: FieldType) => {
  fetch(REST_SERVICE + "/users", {
    method: "GET",
    headers: {
      Authorization:
        "Basic " + btoa(values.username + "@" + DOMAIN + ":" + values.password),
      "Content-Type": "application/json",
    },
  })
    .then(function (response) {
      if (response.status >= 200 && response.status < 300) {
        response.json().then(function (responseWithJWT) {
          const jwt = responseWithJWT.jwt;
          console.log("xxx jwt", jwt);
        });
      } else {
        console.log("xxx error: Bei der Anmeldung ist ein Fehler aufgetreten.");
      }
    })
    .catch(function (err) {
      console.log(
        "xxx error catch: Bei der Anmeldung ist ein Fehler aufgetreten."
      );
    });
};
