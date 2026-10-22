import { Input } from "antd";
import { LinkOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { kassenzeichen } from "@carma-collab/wuppertal/lagis-desktop";
import { byDay, byText, VIEW_DAY } from "../editing/columns";
import { VERDIS_KASSENZEICHEN_URL } from "../../core/extractors/transactionPageExtractor";

const VerdisLink = ({ nummer }) => (
  <div>
    <span className="mr-4">{nummer}</span>
    <a href={VERDIS_KASSENZEICHEN_URL + nummer} target="blank">
      <LinkOutlined className="cursor-pointer text-blue-500 hover:text-blue-400" />
    </a>
  </div>
);

export const kassenzeichenColumns = ({ invalid }) => [
  {
    key: "kassenzeichen",
    title: kassenzeichen.kassenzeichenTable.kassenzeichenCol,
    width: "50%",
    required: true,
    view: {
      dataIndex: "kassenzeichen",
      render: (nummer) => <VerdisLink nummer={nummer} />,
      sorter: byText((row) => row.kassenzeichen),
    },
    edit: (update) => ({
      dataIndex: "nummer",
      sorter: byText((row) => row.nummer),
      render: (nummer, record) =>
        record.kassenzeichenId ? (
          <VerdisLink nummer={nummer} />
        ) : (
          <Input
            size="small"
            maxLength={8}
            placeholder="8 Ziffern"
            status={invalid(record) ? "error" : undefined}
            value={nummer}
            onChange={(event) =>
              update(record.id, {
                nummer: event.target.value.replace(/\D/g, ""),
              })
            }
          />
        ),
    }),
  },
  {
    key: "zugeordnet",
    title: kassenzeichen.kassenzeichenTable.zugeordnetCol,
    width: "50%",
    view: {
      dataIndex: "zugeordnet",
      sorter: byDay((row) => row.zugeordnet, VIEW_DAY),
    },
    edit: () => ({
      dataIndex: "zugeordnetAm",
      sorter: byDay((row) => row.zugeordnetAm),
      render: (day) => (day ? dayjs(day).format(VIEW_DAY) : ""),
    }),
  },
];
