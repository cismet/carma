import { EditOutlined } from "@ant-design/icons";
import { Spin } from "antd";
import FormActions from "./FormActions";

interface FormHeaderProps {
  title: string;
  subtitle: string;
  onCancel?: () => void;
  onSave?: () => void;
  loading?: boolean;
}

const FormHeader = ({ title, subtitle, onCancel, onSave, loading }: FormHeaderProps) => {
  return (
    <div className="flex items-start justify-between p-6 pb-4 gap-4 flex-wrap border-b border-gray-100">
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
          {loading ? (
            <Spin size="small" />
          ) : (
            <EditOutlined className="text-xl text-blue-600" />
          )}
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900 whitespace-nowrap">
            {title}
          </h2>
          <p className="text-sm text-gray-500">{subtitle}</p>
        </div>
      </div>
      {/* <FormActions onCancel={onCancel} onSave={onSave} /> */}
    </div>
  );
};

export default FormHeader;
