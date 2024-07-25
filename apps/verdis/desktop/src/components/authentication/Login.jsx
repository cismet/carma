import { Button, Input, message, Form } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLock, faUser } from "@fortawesome/free-solid-svg-icons";
import { useDispatch } from "react-redux";
import useDevSecrets from "../../hooks/useDevSecrets";
import { useLocation, useNavigate } from "react-router-dom";
import { DOMAIN, REST_SERVICE } from "../../constants/verdis";
import {
  setLoginRequested,
  storeJWT,
  storeLogin,
} from "../../store/slices/auth";
import { useEffect, useState } from "react";

const mockExtractor = (input) => {
  return {};
};

const Login = ({
  dataIn,
  extractor = mockExtractor,
  width = 300,
  height = 200,
}) => {
  const dispatch = useDispatch();
  const { user, password } = useDevSecrets();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || "/";
  const search = location.state?.from?.search || "";
  const [messageApi, contextHolder] = message.useMessage();
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const login = (values) => {
    setLoading(true);
    fetch(REST_SERVICE + "/users", {
      method: "GET",
      headers: {
        Authorization:
          "Basic " +
          btoa(values.username + "@" + DOMAIN + ":" + values.password),
        "Content-Type": "application/json",
      },
    })
      .then(function (response) {
        if (response.status >= 200 && response.status < 300) {
          response.json().then(function (responseWithJWT) {
            const jwt = responseWithJWT.jwt;

            setTimeout(() => {
              setLoading(false);
              dispatch(storeJWT(jwt));
              dispatch(storeLogin(user));
              dispatch(setLoginRequested(false));
              navigate(from + search, { replace: true });
            }, 500);
          });
        } else {
          setLoading(false);
          messageApi.open({
            type: "error",
            content: "Bei der Anmeldung ist ein Fehler aufgetreten.",
          });
        }
      })
      .catch(function (err) {
        setLoading(false);
        messageApi.open({
          type: "error",
          content: "Bei der Anmeldung ist ein Fehler aufgetreten. " + err,
        });
      });
  };

  useEffect(() => {
    form.setFieldsValue({ username: user, password: password });
  }, [password, user]);

  return (
    <div className="flex flex-col gap-8 items-center bg-white/30 z-20 p-10 h-fit lg:w-1/3 w-2/3 rounded-3xl">
      {contextHolder}
      <h1 className="text-white/80 font-semibold text-6xl">VerDIS Desktop</h1>

      <Form className="w-full" form={form} onFinish={login}>
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
              autoFocus
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
            loading={loading}
            className="w-fit"
            htmlType="submit"
          >
            Anmelden
          </Button>
        </div>
      </Form>
    </div>
  );
};

export default Login;
