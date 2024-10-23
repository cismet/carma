import {
  faFile,
  faFileAlt,
  faFileArchive,
  faFileExcel,
  faFileImage,
  faFilePdf,
  faFileWord,
} from '@fortawesome/free-solid-svg-icons';
import IconForAttribute from '../IconForAttribute';

const iconAttributeMap = {
  default: faFile,
  pdf: faFilePdf,
  doc: faFileWord,
  docx: faFileWord,
  png: faFileImage,
  jpg: faFileImage,
  jpeg: faFileImage,
  bmp: faFileImage,
  tif: faFileImage,
  tiff: faFileImage,
  zip: faFileArchive,
  xls: faFileExcel,
  xlsx: faFileExcel,
  csv: faFileExcel,
  txt: faFileAlt,
};

interface DocIconProps {
  fileEnding: string;
}

const DocIcon = ({ fileEnding }: DocIconProps) => {
  if (iconAttributeMap[fileEnding] === undefined) {
    fileEnding = 'default';
  }
  return (
    <IconForAttribute iconAttributeMap={iconAttributeMap} value={fileEnding} />
  );
};

export default DocIcon;
