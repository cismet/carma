import {
  AutoComplete,
  Avatar,
  Button,
  Drawer,
  Input,
  Switch,
  Tooltip,
} from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  fa3,
  faBroom,
  faCloudRain,
  faD,
  faEarthAmericas,
  faTag,
  faUser,
} from "@fortawesome/free-solid-svg-icons";
import {
  ClockCircleOutlined,
  CommentOutlined,
  LoadingOutlined,
  LogoutOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { useEffect, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { storeJWT, storeLogin } from "../../store/slices/auth";
import { getKassenzeichen, resetStates } from "../../store/slices/search";
import {
  getShowChat,
  getShowFrontDetails,
  getShowSeepageDetails,
  getShowSurfaceDetails,
  setShowChat,
} from "../../store/slices/settings";
import PdfCreator from "../ui/PdfCreator";
import Settings from "./Settings";
import SearchBar from "../search/SearchBar";
import GrundBuch from "../ui/GrundBuch";

const logoSrc = "/logo.svg";

const navLinks = (urlParams) => {
  const showSurfaceDetails = useSelector(getShowSurfaceDetails);
  const showFrontDetails = useSelector(getShowFrontDetails);
  const showSeepageDetails = useSelector(getShowSeepageDetails);
  // Function to construct query string
  const constructQueryString = (baseHref) => {
    const searchParams = new URLSearchParams(urlParams);
    return `${baseHref}?${searchParams.toString()}`;
  };

  return [
    {
      title: "Versiegelte Flächen",
      hrefWithoutQuery: "/versiegelteFlaechen",
      href: constructQueryString(
        showSurfaceDetails
          ? "/versiegelteFlaechen/details"
          : "/versiegelteFlaechen"
      ),
      icon: (
        <Tooltip title="Versiegelte Flächen" placement="bottom">
          <FontAwesomeIcon icon={faCloudRain} className="h-6" />
        </Tooltip>
      ),
    },
    {
      title: "Straßenreinigung",
      hrefWithoutQuery: "/strassenreinigung",
      href: constructQueryString(
        showFrontDetails ? "/strassenreinigung/details" : "/strassenreinigung"
      ),
      icon: (
        <Tooltip title="Straßenreinigung" placement="bottom">
          <FontAwesomeIcon icon={faBroom} className="h-6" />
        </Tooltip>
      ),
    },
    {
      title: "Info",
      hrefWithoutQuery: "/info",
      href: constructQueryString("/info"),
      icon: (
        <Tooltip title="Info" placement="bottom">
          <FontAwesomeIcon icon={faTag} className="h-6" />
        </Tooltip>
      ),
    },
    {
      title: "Versickerungsgenehmigungen",
      hrefWithoutQuery: "/versickerungsgenehmigungen",
      href: constructQueryString(
        showSeepageDetails
          ? "/versickerungsgenehmigungen/details"
          : "/versickerungsgenehmigungen"
      ),
      icon: (
        <Tooltip title="Versickerungsgenehmigungen" placement="bottom">
          <FontAwesomeIcon icon={faEarthAmericas} className="h-6" />
        </Tooltip>
      ),
    },
  ];
};

const NavBar = ({ width = "100%", height = 73, style, inStory }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const location = useLocation();
  const showChat = useSelector(getShowChat);
  const kassenzeichen = useSelector(getKassenzeichen);
  const kassenzeichenNummer = kassenzeichen?.kassenzeichennummer8;

  const [urlParams, setUrlParams] = useSearchParams();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const links = navLinks(urlParams);

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
    dispatch(resetStates());
  };

  return (
    <header
      className="flex items-center justify-between bg-white p-2 gap-3"
      style={{ ...style, ...storyStyle, width, height }}
    >
      <div className="md:flex hidden items-center gap-3">
        <Tooltip title="Übersicht" placement="bottom">
          <div
            className="flex gap-2 items-center h-full cursor-pointer"
            onClick={() => navigate("/" + `?${urlParams}`)}
          >
            <img src={logoSrc} alt="Logo" className="h-10" />
            <span
              className={`${
                location.pathname === "/" ? "text-primary" : ""
              } font-semibold no-underline pt-1`}
            >
              VerDIS
            </span>
          </div>
        </Tooltip>
        {links.map((link, i) => (
          <Link to={link.href} key={`navLink_${i}`}>
            <Button
              type="text"
              className={`${
                location.pathname.includes(link.hrefWithoutQuery)
                  ? "text-primary"
                  : ""
              } font-semibold no-underline`}
            >
              <div
                className={`xl:hidden block ${
                  (location.pathname.includes(link.href) && i > 0) ||
                  (link.href === "/" && location.pathname === "/")
                    ? "text-primary"
                    : ""
                }`}
              >
                {link.icon}
              </div>
              <div className="hidden xl:block">{link.title}</div>
            </Button>
          </Link>
        ))}
      </div>
      <SearchBar />
      <div className="flex items-center gap-3">
        <a
          target="d3"
          href={`http://localhost:3033/d3/?kassenzeichen=${kassenzeichenNummer}`}
        >
          <span className="fa-stack cursor-pointer text-xl text-end">
            <FontAwesomeIcon icon={faD} transform="down-4 right-4" />
            <FontAwesomeIcon icon={fa3} transform="left-2 down-10" />
          </span>
        </a>
        <GrundBuch />
        <PdfCreator />
        {/* <Tooltip title="Änderungsanfragen" placement="bottom">
          <CommentOutlined
            className="text-2xl cursor-pointer"
            onClick={() => dispatch(setShowChat(!showChat))}
          />
        </Tooltip> */}
        <Tooltip title="Ausloggen" placement="bottom">
          <LogoutOutlined
            className="text-2xl cursor-pointer"
            onClick={() => logout()}
          />
        </Tooltip>
        <Tooltip title="Einstellungen" placement="bottom">
          <Avatar
            size="large"
            icon={<FontAwesomeIcon icon={faUser} />}
            className="cursor-pointer"
            onClick={() => setDrawerOpen(true)}
          />
        </Tooltip>
        <Drawer
          title="Einstellungen"
          placement="right"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          size="small"
        >
          <Settings />
        </Drawer>
      </div>
    </header>
  );
};

export default NavBar;