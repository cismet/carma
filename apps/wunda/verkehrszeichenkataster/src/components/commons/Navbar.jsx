import { Button, Dropdown, Input, Select } from "antd";

import {
  CaretDownOutlined,
  DiffOutlined,
  EllipsisOutlined,
  FolderOpenOutlined,
  LogoutOutlined,
  PlusOutlined,
  SearchOutlined,
} from "@ant-design/icons";

import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { storeJWT, storeLogin } from "../../store/slices/auth";
import { useEffect, useRef, useState } from "react";
import { getNumberOfItemsThatFit } from "../../tools/helper";
import {
  getAllApplications,
  getSelectedApplications,
  storeAllApplications,
  storeSelectedApplications,
} from "../../store/slices/application";
import NavItem from "./NavItem";
import "./input.css";

const cismetLogoSrc = "/cismet.svg";

const navLinks = () => {
  return [
    {
      title: "Anordnungen",
      href: "/tabelle",
    },
  ];
};

const NavBar = ({ width = "100%", height = 104, style, inStory }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const links = navLinks();
  const location = useLocation();
  const [urlParams, setUrlParams] = useSearchParams();
  const { pathname } = useLocation();
  const allApplications = useSelector(getAllApplications);
  const selectedApplications = useSelector(getSelectedApplications);
  const selectedApplicationsOuterRef = useRef(null);
  const [selectedApplicationsWidth, setSelectedApplicationsWidth] = useState(0);
  const [items, setItems] = useState([]);
  // const items = selectedApplications
  //   ?.slice(
  //     getNumberOfItemsThatFit(selectedApplicationsWidth, 112),
  //     selectedApplications?.length
  //   )
  //   .map((item, i) => {
  //     return {
  //       label: item?.name,
  //       key: i,
  //     };
  //   });

  let storyStyle = {};
  if (inStory) {
    storyStyle = {
      borderStyle: "dotted",
      borderWidth: "1px solid",
      padding: "10px",
    };
  }

  const logout = () => {
    dispatch(storeJWT(undefined));
    dispatch(storeLogin(undefined));
  };

  const getApplicationPath = (id) => {
    const parts = pathname.split("/");
    const currentId = parts[2];

    let newPath = pathname.replace(`/${currentId}/`, `/${id}/`);
    if (!newPath.includes("/anordnung/")) {
      newPath = "/anordnung/" + id + "/verlauf";
    }
    return newPath;
  };

  useEffect(() => {
    setSelectedApplicationsWidth(
      selectedApplicationsOuterRef.current.offsetWidth
    );

    const getWidth = () => {
      setSelectedApplicationsWidth(
        selectedApplicationsOuterRef.current.offsetWidth
      );
    };

    window.addEventListener("resize", getWidth);

    return () => window.removeEventListener("resize", getWidth);
  }, []);

  return (
    <header
      className="flex flex-col gap-3 border-solid border-b-2 border-0 border-zinc-200 bg-[#00000005]"
      style={{ ...style, ...storyStyle, width, height }}
    >
      <div className="flex items-center justify-between p-2 gap-3 max-w-full">
        <div className="md:flex hidden items-center gap-3 overflow-clip w-full">
          <div
            className="flex gap-2 items-center h-full cursor-pointer"
            onClick={() => navigate("/" + `?${urlParams}`)}
          >
            <img src={cismetLogoSrc} alt="Logo" className="h-10" />
            <span
              className={`${
                location.pathname === "/" ? "text-primary" : ""
              } font-semibold no-underline pt-1`}
            >
              VZKat
            </span>
          </div>

          {links.map((link, i) => (
            <Link to={link.href + `?${urlParams}`} key={`navLink_${i}`}>
              <Button
                icon={<FolderOpenOutlined />}
                size="small"
                className={`${
                  location.pathname.includes(link.href) ? "text-primary" : ""
                } font-semibold no-underline mt-1 bg-[#00000005]`}
              >
                {link.title}
              </Button>
            </Link>
          ))}
          {/* {selectedApplications.length > 0 && (
            <div className="border-l border-r-0 h-10 border-solid border-muted-foreground" />
          )} */}
          <div
            className="flex items-center overflow-clip w-full gap-2"
            ref={selectedApplicationsOuterRef}
          >
            {/* {selectedApplications
              ?.slice(
                0,
                getNumberOfItemsThatFit(selectedApplicationsWidth, 112)
              )
              .map((application, i) => (
                <NavItem
                  key={`applicationLink_${i}`}
                  application={application}
                  setItems={(item) => {
                    if (
                      !items.some((value) => value.label === item.timelineTitle)
                    ) {
                      setItems((prevItems) => [
                        ...prevItems,
                        {
                          label: item.timelineTitle,
                          key: item.id,
                        },
                      ]);
                    }
                  }}
                />
              ))}
            {selectedApplications.length >
              getNumberOfItemsThatFit(selectedApplicationsWidth, 112) && (
              <Dropdown trigger={["click"]} menu={{ items }}>
                <Button type="text">
                  <EllipsisOutlined />
                </Button>
              </Dropdown>
            )} */}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Input
            size="small"
            placeholder="Suche..."
            prefix={<SearchOutlined />}
            className="w-96 bg-[#00000005]"
          />
          <Button
            size="small"
            className="bg-[#00000005]"
            onClick={() => {
              const id = allApplications.length + 1;
              dispatch(
                storeAllApplications([
                  ...allApplications,
                  {
                    key: id,
                    name: id,
                    id: id,
                    typ: "internal",
                    timelineStatus: "Offen",
                    timeline: [
                      {
                        id: 1,
                        typ: "request",
                      },
                    ],
                  },
                ])
              );
              dispatch(
                storeSelectedApplications([
                  ...selectedApplications,
                  {
                    key: id,
                    name: id,
                    id: id,
                    typ: "internal",
                    timelineStatus: "Offen",
                    timeline: [
                      {
                        id: 1,
                        typ: "request",
                      },
                    ],
                  },
                ])
              );
              navigate({ pathname: getApplicationPath(id) });
            }}
            icon={<PlusOutlined />}
          >
            Intern
          </Button>
          <Button
            size="small"
            className="bg-[#00000005]"
            onClick={() => {
              const id = allApplications.length + 1;
              dispatch(
                storeAllApplications([
                  ...allApplications,
                  {
                    key: id,
                    name: id,
                    id: id,
                    typ: "external",
                    timelineStatus: "Offen",
                    timeline: [
                      {
                        id: 1,
                        typ: "request",
                      },
                    ],
                  },
                ])
              );
              dispatch(
                storeSelectedApplications([
                  ...selectedApplications,
                  {
                    key: id,
                    name: id,
                    id: id,
                    typ: "external",
                    timelineStatus: "Offen",
                    timeline: [
                      {
                        id: 1,
                        typ: "request",
                      },
                    ],
                  },
                ])
              );
              navigate({ pathname: getApplicationPath(id) });
            }}
            icon={<PlusOutlined />}
          >
            Extern
          </Button>
          <LogoutOutlined
            className="text-2xl cursor-pointer pr-1"
            onClick={() => logout()}
          />
        </div>
      </div>
      <div className="w-full px-2">
        <ul className="flex items-center gap-2 list-none px-0">
          {selectedApplications?.map((application, i) => (
            <li
              className={`p-2 text-sm hover:bg-gray-100 rounded-lg cursor-pointer relative ${
                pathname.includes("anordnung/" + application?.id + "/") &&
                "after:bg-primary after:rounded-md after:absolute after:-bottom-3 after:left-0 after:w-full after:h-0.5 after:content-[''] font-semibold"
              }`}
            >
              <Link
                to={getApplicationPath(application?.id)}
                className="flex items-center gap-2"
              >
                <DiffOutlined className="text-xl" />
                <span>{application.id}</span>
                <span>{application.timelineTitle}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </header>
  );
};

export default NavBar;
