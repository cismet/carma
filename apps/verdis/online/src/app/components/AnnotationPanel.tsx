import React, { useRef, useEffect } from 'react';
import scrollIntoViewIfNeeded from 'scroll-into-view-if-needed';
import { getArea25832 } from '../../utils/kassenzeichenMappingTools';
import {
    faEdit,
    faDrawPolygon,
    faMapMarker
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon as Icon } from '@fortawesome/react-fontawesome';
import { colorChanged, colorDraft, colorUnchanged } from '../../utils/kassenzeichenHelper';

const AnnotationPanel = ({
    annotationFeature: rawFeature,
    editmode = true,
    selected,
    showEditAnnoMenu,
    clickHandler = () => {},
    showEverything = false
}) => {
    const theDivRef = useRef(null);

    useEffect(() => {
        if (theDivRef.current) {
            scrollIntoViewIfNeeded(theDivRef.current, false, {
                duration: 250
            });
        }
    }, [selected]);

    const annotationFeature = JSON.parse(JSON.stringify(rawFeature));
    annotationFeature.crs = {
        type: 'name',
        properties: { name: 'urn:ogc:def:crs:EPSG::25832' }
    };

    const editButtonColor = colorChanged;
    const color = colorChanged;
    const anmerkungsTitleColor = colorUnchanged;

    let borderStyle = 'solid';
    let borderColor = '#ffffff00';

    if (annotationFeature.properties.draft === true) {
        borderColor = colorDraft;
    }

    if (selected === true) {
        borderColor = colorChanged;
    }

    const styleOverride = {
        marginBottom: '5px',
        width: '100%',
        height: '100%',
        borderStyle,
        borderColor,
        borderWidth: 3
    };

    const geomType = annotationFeature.geometry.type;
    const area = getArea25832(annotationFeature);

    const secondaryInfo =
        geomType === 'Polygon' ? (
            <span>
                <Icon style={{ color: '#999' }} icon={faDrawPolygon} /> ~ {Math.round(area)} m²
            </span>
        ) : (
            <Icon style={{ color: '#999' }} icon={faMapMarker} />
        );

    const content = showEverything
        ? annotationFeature.properties.text
        : secondaryInfo;

    return (
        <div ref={theDivRef}>
                onClick={() => clickHandler(annotationFeature)}
            >
                <table style={{ width: '100%' }}>
                    <tbody>
                        <tr>
                            <td>
                                <b style={{ color }}>
                                    Anmerkung {annotationFeature.properties.name}{' '}
                                    {showEverything && <span>({secondaryInfo})</span>}
                                </b>
                            </td>
                            <td style={{ textAlign: 'right' }} />
                            {showEditAnnoMenu && editmode && (
                                <td
                                    style={{
                                        textAlign: 'right',
                                        color: editButtonColor,
                                        cursor: 'pointer'
                                    }}
                                >
                                    <Icon
                                        onClick={(e) => {
                                            showEditAnnoMenu(annotationFeature);
                                            e.stopPropagation();
                                        }}
                                        icon={faEdit}
                                    />
                                </td>
                            )}
                        </tr>
                        <tr>
                            <td style={{ color: anmerkungsTitleColor }}>{content}</td>
                        </tr>
                    </tbody>
                </table>
        </div>
    );
};

export default AnnotationPanel;
