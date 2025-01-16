import { faLock, faUser } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { FormProps } from "antd";
import { Input, Form, Button } from "antd";
import { FieldType, login } from "./helper/getToken";
import { useState } from "react";
import AlkisSearch from "./components/AlkisSearch";

export function App() {
  const [jwt, setJwt] = useState<string | null>(null);

  const onFinish: FormProps<FieldType>["onFinish"] = (value) => {
    login(value, setJwt);
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
      <AlkisSearch jwt={jwt} />
    </div>
  );
}

export default App;
