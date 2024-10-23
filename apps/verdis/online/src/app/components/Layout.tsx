import { ReactNode, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { screenResize } from '../../store/slices/ui';

interface LayoutProps {
  children: ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  const dispatch = useDispatch();
  useEffect(() => {
    const handleResize = () => {
      dispatch(
        screenResize({ width: window.innerWidth, height: window.innerHeight })
      );
    };

    handleResize();

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  });

  return <div>{children}</div>;
};

export default Layout;
