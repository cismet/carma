import React, { useState } from "react";
import { FileSearchOutlined, LoadingOutlined } from "@ant-design/icons";
import { Input, Tooltip } from "antd";
import { getJWT } from "../../store/slices/auth";
import { useSelector, useDispatch } from "react-redux";
import {
  storeContractFlurstucke,
  storeMipaFlurstucke,
  getContractFlurstucke,
  getMipaFlurstucke,
  getLoading,
  getFlurstuckeByContractAndMipa,
} from "../../store/slices/search";
import ShowNumberFilesSearchResult from "./ShowNumberFilesSearchResult";
import { searchContractExtractor } from "../../core/extractors/searchExtractor";
import { useNavigate } from "react-router-dom";
const SearchLandparcelByFileNumber = ({ collapsed, setCollapsed }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const jwt = useSelector(getJWT);
  const contractFlurstucke = useSelector(getContractFlurstucke);
  const mipaFlurstucke = useSelector(getMipaFlurstucke);
  const loading = useSelector(getLoading);
  const [searchValue, setSearchValue] = useState("");

  const fetchFlurstuckeByContractAndMipaHandler = async (value) => {
    await getFlurstuckeByContractAndMipa(value, dispatch, jwt, navigate);
  };
  return (
    <div
      className="mt-auto flex flex-col gap-2"
      style={{
        width: "100%",
        maxHeight:
          !contractFlurstucke || !mipaFlurstucke || collapsed ? "10%" : "40%",
        paddingTop: "max(8px, env(safe-area-inset-top))",
        paddingBottom: "max(8px, env(safe-area-inset-bottom))",
        paddingRight: "max(8px, env(safe-area-inset-right))",
        paddingLeft: "max(8px, env(safe-area-inset-left))",
        marginBottom: "max(4px, env(safe-area-inset-bottom))",
      }}
    >
      <Tooltip title="Aktenzeichen-Suche öffnen">
        <FileSearchOutlined
          style={{ display: !collapsed ? "none" : null, fontSize: "16px" }}
          className="cursor-pointer text-base mx-auto"
          onClick={() => setCollapsed(!collapsed)}
        />
      </Tooltip>
      <ShowNumberFilesSearchResult
        dataContract={contractFlurstucke}
        dataMipa={mipaFlurstucke}
        searchValue={searchValue}
        extractor={searchContractExtractor}
        collapsed={collapsed}
        cleaFunc={() => {
          dispatch(storeContractFlurstucke(undefined));
          dispatch(storeMipaFlurstucke(undefined));
        }}
      />
      <Input
        size="large"
        onPressEnter={(e) =>
          fetchFlurstuckeByContractAndMipaHandler(e.target.value)
        }
        value={searchValue}
        prefix={
          loading ? (
            <LoadingOutlined className="text-xs" />
          ) : (
            <FileSearchOutlined />
          )
        }
        onChange={(e) => {
          setSearchValue(e.target.value);
        }}
        style={{
          display: collapsed ? "none" : null,
          height: "40px",
          marginTop: "auto",
        }}
      />
    </div>
  );
};

export default SearchLandparcelByFileNumber;
