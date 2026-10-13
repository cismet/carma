import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { Modal, Spin, Table } from "antd";
import { vorgange } from "@carma-collab/wuppertal/lagis-desktop";
import LandParcelKeyChooser from "../wizard/LandParcelKeyChooser";
import { getEditParcel } from "../../store/slices/editing";
import { loadLinkableVertraege } from "../../core/editing/vertrag";
import { errorMessage } from "../../core/editing/session";
import { formatPrice } from "../../core/tools/helper";

const columns = (vertragsarten) => {
  const artName = new Map(
    (vertragsarten ?? []).map((art) => [art.id, art.bezeichnung])
  );
  return [
    {
      title: vorgange.vorgangeTable.vertragsartCol,
      dataIndex: "artId",
      render: (artId) => artName.get(artId),
    },
    { title: "Aktenzeichen", dataIndex: "aktenzeichen" },
    {
      title: vorgange.vorgangeTable.quadratmeterpreisCol,
      dataIndex: "quadratmeterpreis",
      render: (preis) => formatPrice(preis, false),
    },
    {
      title: vorgange.vorgangeTable.kaufpreisCol,
      dataIndex: "gesamtpreis",
      render: (preis) => formatPrice(preis, false),
    },
  ];
};

const LinkVertragModal = ({
  open,
  heldIds,
  vertragsarten,
  onLink,
  onClose,
}) => {
  const jwt = useSelector((state) => state.auth.jwt);
  const parcel = useSelector(getEditParcel);
  const [key, setKey] = useState();
  // { rows, allHeld } of the picked parcel
  const [linkable, setLinkable] = useState();
  const rows = linkable?.rows;
  const [error, setError] = useState();
  const [picked, setPicked] = useState([]);

  useEffect(() => {
    setLinkable(undefined);
    setError(undefined);
    setPicked([]);
    if (!key) {
      return;
    }
    let cancelled = false;
    loadLinkableVertraege(key.id, parcel.schluesselId, heldIds, jwt)
      .then((next) => !cancelled && setLinkable(next))
      .catch((e) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
    // heldIds can't change while the modal is open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, jwt]);

  const close = () => {
    setKey(undefined);
    onClose();
  };

  const link = () => {
    onLink(rows.filter((row) => picked.includes(row.id)));
    close();
  };

  return (
    <Modal
      open={open}
      title="Vorhandenen Vertrag hinzufügen"
      okText="Hinzufügen"
      cancelText="Abbrechen"
      okButtonProps={{ disabled: !picked.length }}
      onOk={link}
      onCancel={close}
      width={720}
      destroyOnClose
      centered
    >
      <div className="flex flex-col gap-4">
        <LandParcelKeyChooser
          mode="all"
          value={key}
          onChange={setKey}
          preset={{
            gemarkung: parcel?.key?.gemarkung,
            flur: parcel?.key?.flur,
          }}
          incompleteMessage="Bitte ein Flurstück wählen"
          reject={(candidate) =>
            candidate.id === parcel?.schluesselId
              ? "Das ist das aktuelle Flurstück."
              : undefined
          }
        />
        {error ? (
          <div className="text-red-500">{error}</div>
        ) : key && !rows ? (
          <div className="flex justify-center p-4">
            <Spin />
          </div>
        ) : (
          <Table
            size="small"
            bordered
            pagination={false}
            rowKey="id"
            columns={columns(vertragsarten)}
            dataSource={rows ?? []}
            rowSelection={{
              selectedRowKeys: picked,
              onChange: setPicked,
            }}
            locale={{
              emptyText: !key
                ? "Bitte ein Flurstück wählen."
                : linkable?.allHeld
                ? "Alle Verträge dieses Flurstücks sind hier schon eingetragen."
                : "Dieses Flurstück hat keine Verträge.",
            }}
          />
        )}
      </div>
    </Modal>
  );
};

export default LinkVertragModal;
