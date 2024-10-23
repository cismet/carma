import { Outlet, useParams } from "react-router-dom";
import Sidebar from "../components/commons/Sidebar";
import { useDispatch, useSelector } from "react-redux";
import {
  getSelectedApplications,
  storeCurrentApplication,
} from "../store/slices/application";

const DetailsWrapper = () => {
  const { id } = useParams();
  const selectedApplications = useSelector(getSelectedApplications);
  const dispatch = useDispatch();

  const selectedApplication = selectedApplications.find(
    (element) => element.id.toString() === id
  );

  dispatch(storeCurrentApplication(selectedApplication));

  return (
    <div className="h-full max-h-[calc(100vh-104px)] flex w-full bg-zinc-200 overflow-clip">
      <Sidebar />
      <div className="h-full w-full p-2 flex flex-col gap-2 items-center">
        <Outlet />
      </div>
    </div>
  );
};

export default DetailsWrapper;
