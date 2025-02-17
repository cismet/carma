import {
  DollarOutlined,
  FolderOpenOutlined,
  FileSearchOutlined,
  DashboardOutlined,
  SettingOutlined,
  PieChartOutlined,
  HistoryOutlined,
  TransactionOutlined,
  FilePdfOutlined,
  MenuOutlined,
  AuditOutlined,
} from "@ant-design/icons";
import { useState } from "react";
import { Badge, Menu } from "antd";
import "./menu.css";
import Logo from "../ui/logo/Logo";
import { useEffect } from "react";
import { buildUrlParams } from "../../core/tools/helper";
import { useSelector } from "react-redux";
import {
  getMipa,
  getOffices,
  getRebe,
  getCountOfUsage,
  getContract,
  getTransaction,
  getDms,
  getAdditionalRollen,
  getStreetFronts,
  getHistory,
  getLandparcel,
} from "../../store/slices/lagis";
import { useLocation, NavLink } from "react-router-dom";
import { defaultLinksColor } from "../../core/tools/helper";
import SearchLandparcelByFileNumber from "../searcher/SearchLandparcelByFileNumber";
import { menuNamesHelper } from "@carma-collab/wuppertal/lagis-desktop";
import {
  dmsExtractor,
  historyExtractor,
  mipaExtractor,
  officesExtractor,
  operationExtractor,
  rebeExtractor,
  transactionExtractor,
  usageExtractor,
} from "../../core/extractors/overviewExtractors";
import { Tag } from "antd";

function getItem(label, key, icon, children) {
  return {
    key,
    icon,
    children,
    label,
  };
}

const SidebarMenu = ({ parametersForLink }) => {
  const mipa = useSelector(getMipa);
  const offices = useSelector(getOffices);
  const rebe = useSelector(getRebe);
  const usage = useSelector(getCountOfUsage);
  const contracts = useSelector(getContract);
  const transaction = useSelector(getTransaction);
  const dms = useSelector(getDms);
  const additionalRoll = useSelector(getAdditionalRollen);
  const streetFronts = useSelector(getStreetFronts);
  const history = useSelector(getHistory);
  const location = useLocation();
  const [activeKey, setActiveKey] = useState("/");
  const [collapsed, setCollapsed] = useState(false);
  const toggleCollapsed = () => {
    setCollapsed(!collapsed);
  };
  const storyWidth = 256;
  const isStory = false;
  const storyStyle = {
    width: isStory ? storyWidth : "100%",
    height: isStory ? "600px" : "100%",
  };

  const landparcel = useSelector(getLandparcel);
  const rebeNumber = rebeExtractor({ rebe, landparcel });
  const mipaNumber = mipaExtractor({ mipa, landparcel });
  const usageNumber = usageExtractor(landparcel);
  const transactionNumber = transactionExtractor(landparcel);
  const operationNumber = operationExtractor(landparcel);
  const historyNumber = historyExtractor(history);
  const dmsNumber = dmsExtractor(landparcel);
  const officesData = officesExtractor(landparcel);
  const officesNumber = officesData?.currentOffices
    ? officesData.currentOffices.length
    : 0;

  const items = [
    getItem(
      <NavLink to={`/?${buildUrlParams(parametersForLink)}`}>
        {menuNamesHelper.ubersicht}
      </NavLink>,
      "/",
      <DashboardOutlined />
    ),
    getItem(
      offices.length > 0 ||
        additionalRoll.length > 0 ||
        streetFronts.length > 0 ? (
        <NavLink
          to={`/verwaltungsbereiche?${buildUrlParams(parametersForLink)}`}
        >
          {/* <Badge count={officesNumber} size="small"> */}
          <span>{menuNamesHelper.verwaltungsbereiche} </span>
          <Tag>{officesNumber > 0 && officesNumber}</Tag>
          {/* </Badge> */}
          {/* <span>{menuNamesHelper.verwaltungsbereiche}</span> */}

          {/* {officesNumber > 0 && officesNumber} */}
        </NavLink>
      ) : (
        <span style={{ color: defaultLinksColor }}>
          {" "}
          {menuNamesHelper.verwaltungsbereiche}
        </span>
      ),
      "/verwaltungsbereiche",
      // <Badge count={officesNumber} size="small">
      <FolderOpenOutlined
        style={{
          color:
            offices.length > 0 ||
            additionalRoll.length > 0 ||
            streetFronts.length > 0
              ? null
              : defaultLinksColor,
        }}
      />
      // </Badge>
    ),
    getItem(
      mipa && mipa.length > 0 ? (
        <NavLink to={`/miet?${buildUrlParams(parametersForLink)}`}>
          {/* <Badge count={mipaNumber.numberOfRents} size="small"> */}
          {menuNamesHelper.mipa}{" "}
          <Tag>{mipaNumber.numberOfRents > 0 && mipaNumber.numberOfRents}</Tag>
          {/* </Badge> */}
          {/* {menuNamesHelper.mipa} */}
          {/* {mipaNumber.numberOfRents > 0 && mipaNumber.numberOfRents} */}
        </NavLink>
      ) : (
        <span style={{ color: defaultLinksColor }}>{menuNamesHelper.mipa}</span>
      ),
      "/miet",
      // <Badge count={mipaNumber.numberOfRents} size="small">
      <DollarOutlined
        style={{
          color: mipa && mipa.length > 0 ? null : defaultLinksColor,
        }}
      />
      // </Badge>
    ),
    getItem(
      rebe && rebe.length > 0 ? (
        <NavLink to={`/rechte?${buildUrlParams(parametersForLink)}`}>
          {/* <Badge count={rebeNumber.numberOfRights} size="small"> */}
          {menuNamesHelper.rebe}{" "}
          <Tag>
            {rebeNumber.numberOfRights > 0 && rebeNumber.numberOfRights}
          </Tag>
          {/* </Badge> */}
          {/* {menuNamesHelper.rebe}{" "} */}
          {/* {rebeNumber.numberOfRights > 0 && rebeNumber.numberOfRights} */}
        </NavLink>
      ) : (
        <span style={{ color: defaultLinksColor }}>{menuNamesHelper.rebe}</span>
      ),
      "/rechte",
      // <Badge count={rebeNumber.numberOfRights} size="small">
      <SettingOutlined
        style={{
          color: rebe && rebe.length > 0 ? null : defaultLinksColor,
        }}
      />
      // </Badge>
    ),
    getItem(
      usage && usage > 0 ? (
        <NavLink to={`/nutzung?${buildUrlParams(parametersForLink)}`}>
          {/* <Badge count={usageNumber.numberOfUsages} size="small"> */}
          {/* {menuNamesHelper.nutzung} */}
          {/* </Badge> */}
          {menuNamesHelper.nutzung}{" "}
          <Tag>
            {usageNumber.numberOfUsages > 0 && usageNumber.numberOfUsages}
          </Tag>
        </NavLink>
      ) : (
        <span style={{ color: defaultLinksColor }}>
          {menuNamesHelper.nutzung}
        </span>
      ),
      "/nutzung",
      // <Badge count={usageNumber.numberOfUsages} size="small">
      <PieChartOutlined
        style={{
          color: usage && usage > 0 ? null : defaultLinksColor,
        }}
      />
      // </Badge>
    ),
    getItem(
      contracts && contracts.length > 0 ? (
        <NavLink to={`/vorgange?${buildUrlParams(parametersForLink)}`}>
          {/* <Badge count={operationNumber.numberOfOperations} size="small">
            {menuNamesHelper.vorgange}
          </Badge> */}
          {menuNamesHelper.vorgange}{" "}
          <Tag>
            {operationNumber.numberOfOperations > 0 &&
              operationNumber.numberOfOperations}
          </Tag>
          {/* {operationNumber.numberOfOperations > 0 &&
            operationNumber.numberOfOperations}{" "}
          */}
        </NavLink>
      ) : (
        <span style={{ color: defaultLinksColor }}>
          {menuNamesHelper.vorgange}
        </span>
      ),
      "/vorgange",
      // <Badge count={operationNumber.numberOfOperations} size="small">
      <AuditOutlined
        style={{
          color: contracts && contracts.length > 0 ? null : defaultLinksColor,
        }}
      />
      /* </Badge> */
    ),
    getItem(
      history !== undefined ? (
        <NavLink to={`/historie?${buildUrlParams(parametersForLink)}`}>
          {/* <Badge count={history + 1} size="small"> */}
          {/* {menuNamesHelper.historie} */}
          {/* </Badge> */}
          {menuNamesHelper.historie}{" "}
          <Tag>{historyNumber !== undefined && history + 1}</Tag>
          {/* <span>({historyNumber !== undefined && history + 1})</span> */}
        </NavLink>
      ) : (
        <span style={{ color: defaultLinksColor }}>
          {menuNamesHelper.historie}
        </span>
      ),
      "/historie",
      // <Badge count={history + 1} size="small">
      <HistoryOutlined
        style={{
          color: history === undefined && defaultLinksColor,
        }}
      />
      // </Badge>
    ),
    getItem(
      transaction && transaction.length > 0 ? (
        <NavLink to={`/kassenzeichen?${buildUrlParams(parametersForLink)}`}>
          {/* <Badge count={transactionNumber.numberOfDocuments} size="small"> */}
          {menuNamesHelper.kassenzeichen}{" "}
          <Tag>
            {transactionNumber.numberOfDocuments > 0 &&
              transactionNumber.numberOfDocuments}
          </Tag>
          {/* </Badge> */}
          {/* {menuNamesHelper.kassenzeichen}{" "}
          {transactionNumber.numberOfDocuments > 0 &&
            transactionNumber.numberOfDocuments} */}
        </NavLink>
      ) : (
        <span style={{ color: defaultLinksColor }}>
          {menuNamesHelper.kassenzeichen}
        </span>
      ),
      "/kassenzeichen",
      // <Badge count={transactionNumber.numberOfDocuments} size="small">
      <TransactionOutlined
        style={{
          color:
            transaction && transaction.length > 0 ? null : defaultLinksColor,
        }}
      />
      // </Badge>
    ),
    getItem(
      dms && dms.length > 0 ? (
        <NavLink to={`/dms?${buildUrlParams(parametersForLink)}`}>
          {/* <Badge count={dmsNumber.numberOfDocuments} size="small"> */}
          {menuNamesHelper.dms}{" "}
          <Tag>
            {dmsNumber.numberOfDocuments > 0 && dmsNumber.numberOfDocuments}
          </Tag>
          {/* </Badge> */}
          {/* {menuNamesHelper.dms}{" "}
          {dmsNumber.numberOfDocuments > 0 && dmsNumber.numberOfDocuments} */}
        </NavLink>
      ) : (
        <span style={{ color: defaultLinksColor }}>{menuNamesHelper.dms}</span>
      ),
      "/dms",
      // <Badge count={dmsNumber.numberOfDocuments} size="small">
      <FilePdfOutlined
        style={{
          color: dms && dms.length > 0 ? null : defaultLinksColor,
        }}
      />
      // </Badge>
    ),
  ];
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 1024) {
        setCollapsed(true);
      } else {
        setCollapsed(false);
      }
    };

    // handleResize();
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);
  useEffect(() => {
    setActiveKey(location.pathname);
  }, [location.pathname]);

  return (
    <div
      className="bg-white flex flex-col gap-4 overflow-clip"
      style={{
        ...storyStyle,
      }}
    >
      <div
        className="flex flex-wrap items-start gap-2 h-[calc(6%-36px)]"
        style={{
          justifyContent: !collapsed ? "start" : "center",
          marginLeft: !collapsed ? "20px" : "0px",
          marginTop: "16px",
          marginBottom: "16px",
        }}
      >
        <span onClick={toggleCollapsed} className="cursor-pointer">
          <MenuOutlined style={{ textAlign: "left" }} />
        </span>
        <Logo showText={collapsed} />
      </div>

      <div className="side-menu lg:ml-[-5px] overflow-y-auto overflow-x-hidden">
        <Menu
          style={{ border: 0, width: !collapsed ? "280px" : "81px" }}
          defaultSelectedKeys={activeKey}
          selectedKeys={[activeKey]}
          items={items}
          mode="inline"
          inlineCollapsed={collapsed}
        />
      </div>
      <SearchLandparcelByFileNumber
        collapsed={collapsed}
        setCollapsed={setCollapsed}
      />
    </div>
  );
};
export default SidebarMenu;
