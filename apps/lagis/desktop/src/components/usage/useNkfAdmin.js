import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { getJWT } from "../../store/slices/auth";
import { canAdminNkf } from "../../core/editing/permissions";

const useNkfAdmin = () => {
  const jwt = useSelector(getJWT);
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    let current = true;
    setAllowed(false);
    if (jwt) {
      canAdminNkf(jwt).then((granted) => current && setAllowed(granted));
    }
    return () => {
      current = false;
    };
  }, [jwt]);
  return allowed;
};

export default useNkfAdmin;
