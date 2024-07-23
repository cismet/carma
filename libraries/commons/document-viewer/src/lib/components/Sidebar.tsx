import { useRef } from 'react';
import Icon from 'react-cismap/commons/Icon';
import { Doc } from '../document-viewer';
import { useNavigate, useParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFile } from '@fortawesome/free-regular-svg-icons';
import { ProgressBar } from 'react-bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';

interface SidebarProps {
  docs: Doc[];
  index: number;
  maxIndex: number;
  mode: string;
  compactView: boolean;
}

const Sidebar = ({
  docs,
  index,
  maxIndex,
  mode,
  compactView,
}: SidebarProps) => {
  const { docPackageId, page } = useParams();
  const navigate = useNavigate();
  const sidebarRef = useRef(null);

  const SIDEBAR_FILENAME_SHORTENER = {
    bplaene: (original: string) => {
      const ret = original
        .replace(/.pdf$/, '')
        .replace(/^BPL_n?a?\d*V?-?(A|B|C)*\d*_(0_)*/, '')
        .replace(/Info_BPlan-Zusatzdokumente_WUP.*/, 'Info Dateinamen');
      return ret;
    },
    aenderungsv: (original: string) => {
      return original.replace(/.pdf$/, '').replace(/^FNP_n*\d*_\d*(And)*_/, '');
    },
  };

  const filenameShortener = (original: string) => {
    const shorty = SIDEBAR_FILENAME_SHORTENER[mode](original);

    return shorty;
  };

  return (
    <div ref={sidebarRef}>
      <div style={{ marginBottom: 8 }}>
        {docs?.length > 0 &&
          docs?.map((doc, i) => (
            <div
              style={{
                background: `${
                  index - 1 === i ? 'rgb(119, 119, 119)' : '#f5f5f5'
                }`,
                height: '100%',
                padding: 6,
                marginBottom: '8px',
                cursor: 'pointer',
                color: '#333',
              }}
              onClick={() => navigate(`/docs/${docPackageId}/${i + 1}/1`)}
            >
              <div
                style={{
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                  display: 'flex',
                  gap: '6px',
                }}
              >
                {doc.group === 'Zusatzdokumente' ? (
                  <FontAwesomeIcon
                    icon={faFile}
                    size={compactView ? '3x' : '1x'}
                  />
                ) : (
                  <Icon name="file-pdf-o" size={compactView ? '3x' : '1x'} />
                )}

                <p
                  style={{
                    marginTop: 2,
                    marginBottom: 5,
                    fontSize: 11,
                    wordWrap: 'break-word',
                    textWrap: 'pretty',
                    overflowWrap: 'break-word',
                    textAlign: 'center',
                  }}
                >
                  <span>{doc.title || filenameShortener(doc.file)}</span>
                </p>
                {index - 1 === i && (
                  <>
                    <ProgressBar
                      style={{
                        height: '5px',
                        width: '100%',
                        marginTop: 0,
                        marginBottom: 0,
                      }}
                      max={maxIndex}
                      min={0}
                      now={parseInt(page!)}
                    />
                    <p style={{ marginBottom: 0 }}>
                      {page} / {maxIndex}
                    </p>
                  </>
                )}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
};

export default Sidebar;
