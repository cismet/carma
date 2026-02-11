import { EditOutlined } from "@ant-design/icons";
import FormActions from "./FormActions";

interface FormHeaderProps {
  title: string;
  subtitle: string;
  onCancel?: () => void;
  onSave?: () => void;
}

const FormHeader = ({ title, subtitle, onCancel, onSave }: FormHeaderProps) => {
  return (
    <div className="flex items-start justify-between p-6 pb-2">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
          <EditOutlined className="text-xl text-blue-600" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <p className="text-sm text-gray-500">{subtitle}</p>
        </div>
      </div>
      <FormActions onCancel={onCancel} onSave={onSave} />
    </div>
  );
};

export default FormHeader;
