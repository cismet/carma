// import { LoadingOutlined } from "@ant-design/icons";
// import { Spin } from "antd";
// const PrintButton = ({ hadlerStartPrint, loading }) => {
//   return (
//     <div>
//       <button
//         className="rectangle-button ml-auto"
//         onClick={hadlerStartPrint}
//         disabled={loading}
//       >
//         {loading ? (
//           <Spin
//             indicator={<LoadingOutlined spin />}
//             className="mr-2 "
//             size="small"
//           />
//         ) : (
//           "Print"
//         )}
//       </button>
//     </div>
//   );
// };

import { faPrint } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect } from "react";
import { LoadingOutlined } from "@ant-design/icons";
import { Spin } from "antd";

const PrintButton = ({ hadlerStartPrint, loading }) => {
  useEffect(() => {
    console.log("xxx print loading", loading);
  }, [loading]);
  return (
    <>
      <button className="rectangle-button" onClick={hadlerStartPrint}>
        {/* <FontAwesomeIcon icon={faPrint} className="text-xl cursor-pointer" /> */}

        {loading ? (
          <Spin
            indicator={<LoadingOutlined spin />}
            className="mr-2 "
            size="small"
          />
        ) : (
          "Drucken"
        )}
      </button>
    </>
  );
};

export default PrintButton;
