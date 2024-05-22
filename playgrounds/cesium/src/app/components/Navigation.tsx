import { Menu } from 'antd';
import { useNavigate } from 'react-router-dom';
export function Navigation({ routes, ...props }) {
  const navigate = useNavigate();

  const items = routes.map(([path, name, elementOrChildren]) =>
    Array.isArray(elementOrChildren)
      ? {
          key: path,
          label: name,
          icon: null,
          children: elementOrChildren.map(([childPath, childName]) => ({
            key: `${path}${childPath}`,
            label: childName,
            icon: null,
            onClick: () => navigate(`${path}${childPath}`),
          })),
        }
      : {
          key: path,
          label: name,
          icon: null,
          onClick: () => navigate(path),
        }
  );

  return <Menu {...props} mode="horizontal" theme="dark" items={items} />;
}

export default Navigation;
