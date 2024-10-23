import React from "react";
import Icon from "react-cismap/commons/Icon";
import Well from "react-cismap/commons/Well";

/* eslint-disable jsx-a11y/anchor-is-valid */

const COMP = ({
  externalCollapsedState = false,
  fixedRow = false,
  alwaysVisibleDiv = <div>alwaysVisibleDiv</div>,
  collapsibleDiv = (
    <div>
      collapsibleDiv collapsibleDiv collapsibleDiv collapsibleDiv collapsibleDiv collapsibleDiv
      collapsibleDiv collapsibleDiv collapsibleDiv collapsibleDiv collapsibleDiv collapsibleDiv
      collapsibleDiv collapsibleDiv collapsibleDiv collapsibleDiv collapsibleDiv collapsibleDiv
      collapsibleDiv collapsibleDiv{" "}
    </div>
  ),
  upButton = (
    <h4 style={{ margin: 2, fontSize: "18px" }}>
      <Icon title='vollständige info-Box' style={{ color: "#7e7e7e" }} name='chevron-circle-up' />
    </h4>
  ),
  downButton = (
    <h4 style={{ margin: 2, fontSize: "18px" }}>
      <Icon title='kompakte Info-Box' style={{ color: "#7e7e7e" }} name='chevron-circle-down' />
    </h4>
  ),
  collapseButtonAreaStyle = {},
  bsSize = "small",
  style = { pointerEvents: "auto" },
  onClick = () => {},
  keyToUse,
  debugBorder = 0,
  tableStyle = {},
  collapsed,
  setCollapsed,
  isCollapsible = true,
}) => {
  const buttonInUse = <div>{collapsed === true ? upButton : downButton}</div>;

  // let divWhenCollapsed = alwaysVisibleDiv;

  // let divWhenLarge = [ alwaysVisibleDiv, collapsibleDiv ];
  // if (fixedRow) {
  // 	divWhenLarge = (
  // 		<table width='100%' border={debugBorder} style={tableStyle}>
  // 			<tbody>
  // 				<tr>
  // 					<th style={{ verticalAlign: 'middle' }}>{alwaysVisibleDiv}</th>
  // 					{isCollapsible && (
  // 						<th
  // 							rowSpan='2'
  // 							style={{
  // 								verticalAlign: 'middle',
  // 								textAlign: 'center',
  // 								...collapseButtonAreaStyle
  // 							}}
  // 						>
  // 							{buttonInUse}
  // 						</th>
  // 					)}
  // 				</tr>
  // 				{(!isCollapsible || !collapsed === true) && (
  // 					<tr>
  // 						<td>{collapsibleDiv}</td>
  // 					</tr>
  // 				)}
  // 			</tbody>
  // 		</table>
  // 	);
  // }
  // return (
  // 	<CollapsibleABWell
  // 		externalCollapsedState={externalCollapsedState}
  // 		fixedRow={fixedRow}
  // 		upButton={upButton}
  // 		downButton={downButton}
  // 		collapseButtonAreaStyle={collapseButtonAreaStyle}
  // 		bsSize={bsSize}
  // 		style={style}
  // 		onClick={onClick}
  // 		keyToUse={keyToUse}
  // 		debugBorder={debugBorder}
  // 		tableStyle={tableStyle}
  // 		collapsed={collapsed}
  // 		setCollapsed={setCollapsed}
  // 		tableStyle={tableStyle}
  // 		divWhenCollapsed={divWhenCollapsed}
  // 		divWhenLarge={divWhenLarge}
  // 	/>
  // );
  if (fixedRow) {
    return (
      <Well onClick={onClick} key={keyToUse} bsSize={bsSize} style={style}>
        <table width='100%' border={debugBorder} style={tableStyle}>
          <tbody>
            <tr>
              {alwaysVisibleDiv && <th style={{ verticalAlign: "middle" }}>{alwaysVisibleDiv}</th>}
              {!alwaysVisibleDiv && <th style={{ verticalAlign: "middle", padding: "0px" }}></th>}

              {isCollapsible && (
                <th
                  rowSpan='2'
                  style={{
                    verticalAlign: "middle",
                    textAlign: "center",
                    cursor: "pointer",
                    ...collapseButtonAreaStyle,
                  }}
                  onClick={() => setCollapsed(!collapsed)}
                >
                  {buttonInUse}
                </th>
              )}
            </tr>
            {(!isCollapsible || !collapsed === true) && (
              <tr>
                <td>{collapsibleDiv}</td>
              </tr>
            )}
          </tbody>
        </table>
      </Well>
    );
  } else {
    return (
      <Well onClick={onClick} key={keyToUse} bsSize={bsSize} style={style}>
        <table width='100%' border={debugBorder}>
          <tbody>
            <tr>
              {alwaysVisibleDiv && <th style={{ verticalAlign: "middle" }}>{alwaysVisibleDiv}</th>}
              {!alwaysVisibleDiv && <th style={{ verticalAlign: "middle", padding: "0px" }}></th>}
              {isCollapsible && (
                <th
                  style={{
                    verticalAlign: "middle",
                    textAlign: "center",
                    cursor: "pointer",
                    ...collapseButtonAreaStyle,
                  }}
                  onClick={() => setCollapsed(!collapsed)}
                >
                  {buttonInUse}
                </th>
              )}
            </tr>

            {(!isCollapsible || !collapsed === true) && (
              <tr>
                <td colSpan='2'>{collapsibleDiv}</td>
              </tr>
            )}
          </tbody>
        </table>
      </Well>
    );
  }
};

export default COMP;
