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

// export default PrintButton;

const PrintButton = ({ hadlerStartPrint }) => {
  return (
    <>
      <button
        className="rectangle-button"
        onClick={hadlerStartPrint}
        style={
          {
            // background: "rgba(0, 0, 0, 0.9)",
            // cursor: "pointer",
          }
        }
      >
        {/* <FontAwesomeIcon icon={faPrint} className="text-xl cursor-pointer" /> */}
        Drucken
      </button>
    </>
  );
};

export default PrintButton;
