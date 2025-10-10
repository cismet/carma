import { useState } from "react";
import { Modal, Form, Input, Button, Alert } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";
import { useAuth } from "../../core/context/AuthContext";
import { APP_CONFIG } from "../../config/appConfig";

interface LoginModalProps {
  open: boolean;
}

const LoginModal = ({ open }: LoginModalProps) => {
  const { setAuth } = useAuth();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (values: {
    username: string;
    password: string;
  }) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${APP_CONFIG.restService}users`, {
        method: "GET",
        headers: {
          Authorization:
            "Basic " +
            btoa(`${values.username}@${APP_CONFIG.domain}:${values.password}`),
          "Content-Type": "application/json",
        },
      });
      if (!res.ok) {
        throw new Error("Login failed");
      }
      const data = await res.json();
      await setAuth(data.jwt, values.username);
      form.resetFields();
    } catch (e) {
      setError("Anmeldung fehlgeschlagen. Bitte Zugangsdaten prüfen.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} closable={false} footer={null} centered>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <h2>Anmeldung erforderlich</h2>
        <p style={{ color: "#666" }}>Bitte melden Sie sich an</p>
      </div>
      <Form form={form} layout="vertical" onFinish={handleLogin}>
        <Form.Item
          name="username"
          label="Benutzername"
          rules={[{ required: true, message: "Bitte Benutzername eingeben" }]}
        >
          <Input
            prefix={<UserOutlined />}
            placeholder="Benutzername"
            size="large"
          />
        </Form.Item>
        <Form.Item
          name="password"
          label="Passwort"
          rules={[{ required: true, message: "Bitte Passwort eingeben" }]}
        >
          <Input.Password
            prefix={<LockOutlined />}
            placeholder="Passwort"
            size="large"
            autoFocus
          />
        </Form.Item>
        {error && (
          <Alert
            message={error}
            type="error"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}
        <Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            loading={loading}
            block
            size="large"
          >
            Anmelden
          </Button>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default LoginModal;
