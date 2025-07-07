import { Button, Form, Input, Popover } from "antd";
import React, { useEffect } from "react";

// import "antd/dist/antd.min.css";
import { useWindowSize } from "@react-hook/window-size";
import { useDispatch, useSelector } from "react-redux";
import { useLocation, useNavigate } from "react-router-dom";

export const background = "belis_background_iStock-139701369_blurred.jpg";

const Login = () => {
  const windowSize = useWindowSize();
  const [form] = Form.useForm();
  const browserlocation = useLocation();
  const dispatch = useDispatch();
  const navigate = useNavigate();

  //   const jwt = useSelector(getJWT);

  const productionMode = process.env.NODE_ENV === "production";
  const windowHeight = windowSize[1];
  //   useEffect(() => {
  //   }, [jwt, dispatch]);

  //   useEffect(() => {
  //     (async () => {
  //       try {
  //         if (!productionMode) {
  //           const result = await fetch("devSecrets.json");
  //           const cheats = await result.json();
  //           console.log("devSecrets.json found");

  //           let values = {};
  //           if (cheats.cheatingUser) {
  //             // setUser(cheats.cheatingUser);
  //             values.user = cheats.cheatingUser;
  //           }
  //           if (cheats.cheatingPassword) {
  //             // setPw(cheats.cheatingPassword);
  //             values.password = cheats.cheatingPassword;
  //           }

  //           form.setFieldsValue({
  //             username: values.user,
  //             password: values.password,
  //           });
  //         } else {
  //           form.setFieldsValue({ username: lastSuccesfulUser });
  //         }
  //       } catch (e) {
  //         console.log("no devSecrets.json found");
  //       }
  //     })();
  //   }, [productionMode]);

  const loginPanelWidth = 450;
  const loginPanelHeight = 300;
  //   const onFinish = (values) => {
  //     login(values.username, values.password);
  //   };
  /*eslint no-useless-concat: "off"*/
  //   const login = (user, pw) => {
  //     fetch(REST_SERVICE + "/users", {
  //       method: "GET",
  //       headers: {
  //         Authorization: "Basic " + btoa(user + "@" + DOMAIN + ":" + pw),
  //         "Content-Type": "application/json",
  //       },
  //     })
  //       .then(function (response) {
  //         if (response.status >= 200 && response.status < 300) {
  //           response.json().then(function (responseWithJWT) {
  //             const jwt = responseWithJWT.jwt;
  //             setLoginInfo({
  //               color: "#038643",
  //               text: "Anmeldung erfolgreich. Daten werden geladen.",
  //             });
  //             setTimeout(() => {
  //               navigate("/app" + browserlocation.search);
  //               dispatch(storeJWT(jwt));
  //               dispatch(storeLogin(user));
  //               dispatch(setHealthState({ jwt, healthState: HEALTHSTATUS.OK }));
  //               setLoginInfo();
  //               dispatch(forceRefresh());
  //             }, 500);
  //           });
  //         } else {
  //           setLoginInfo({
  //             color: "#703014",
  //             text: "Bei der Anmeldung ist ein Fehler aufgetreten.",
  //           });
  //           setTimeout(() => {
  //             setLoginInfo();
  //           }, 2500);
  //         }
  //       })
  //       .catch(function (err) {
  //         setLoginInfo({
  //           color: "#703014",
  //           text: "Bei der Anmeldung ist ein Fehler aufgetreten.",
  //         });
  //         setTimeout(() => {
  //           setLoginInfo();
  //         }, 2500);
  //       });
  //   };

  const onFinishFailed = (errorInfo) => {
    console.log("Failed:", errorInfo);
  };

  const baseUrl = window.location.origin + window.location.pathname;

  return (
    <div
      style={{
        // background: "#dddddd",
        height: windowHeight,
        width: "100%",
        background: `url(${baseUrl}images/${background})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          width: loginPanelWidth,
          height: loginPanelHeight,
          background: "#ffffff22",

          borderRadius: 25,
        }}
      >
        <h1
          style={{
            padding: 25,
            color: "black",
            opacity: 0.5,
            paddingBottom: 4,
          }}
        >
          BelIS-Online
        </h1>
        <div
          style={{
            minHeight: 21,
            color: loginInfo?.color || "black",
            marginRight: 10,
          }}
        >
          {loginInfo?.text || ""}
        </div>
        <Form
          form={form}
          name="basic"
          //   labelCol={{ span: 8 }}
          //   wrapperCol={{ span: 16 }}
          onFinish={onFinish}
          onFinishFailed={onFinishFailed}
          autoComplete="off"
          style={{
            justifyContent: "left",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "left",
            padding: 20,
          }}
        >
          <Form.Item
            label="Benutzer"
            name="username"
            rules={[
              {
                required: true,
                message: "Bitte geben Sie Ihren Benutzernamen an",
              },
            ]}
          >
            <Input />
          </Form.Item>

          <Form.Item
            label="Passwort"
            name="password"
            rules={[
              { required: true, message: "Bitte geben Sie ein Passwort an." },
            ]}
          >
            <Input.Password />
          </Form.Item>
          <div style={{ width: "100%" }}>
            <Form.Item style={{ float: "right" }}>
              {isCacheFullyUsable === true && (
                <Button
                  style={{ marginRight: 15 }}
                  type="secondary"
                  onClick={() => {
                    dispatch(setConnectionMode(CONNECTIONMODE.FROMCACHE));
                    dispatch(setLoginRequested(false));
                    navigate("/app" + browserlocation.search);
                  }}
                >
                  Offline arbeiten
                </Button>
              )}
              <Button type="primary" htmlType="submit">
                Login
              </Button>
            </Form.Item>
          </div>
        </Form>
      </div>
      <div style={{ position: "absolute", top: 20, left: 30, opacity: 0.7 }}>
        <h1 style={{ color: "white" }}>
          <img alt="" width={180} src="/images/wuppertal-white.svg" />
        </h1>
      </div>
      <div
        style={{
          position: "absolute",
          top: 20,
          right: 20,
          textAlign: "right",
          opacity: 0.7,
        }}
      >
        <h5 style={{ color: "white" }}>Stadt Wuppertal</h5>
        <h5 style={{ color: "white" }}>Straßen und Verkehr</h5>
        <h5 style={{ color: "white" }}>104.25 Öffentliche Beleuchtung</h5>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 20,
          right: 30,
          opacity: 0.5,
          width: 300,
          textAlign: "right",
          color: "white",
        }}
      >
        {/* <VersionFooter linkStyling={{ color: "grey" }} /> */}
      </div>
    </div>
  );
};
export default Login;
