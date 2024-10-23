import React from 'react';
import Color from 'color';

// Since this component is simple and static, there's no parent container for it.
const Legend = ({ legendObjects = [] }) => {
	return (
		<table style={{ width: '100%' }}>
			<tbody>
				<tr>
					{legendObjects.map((item) => {
						let backgroundColor = Color(item.bg);

						let textColor = 'black';
						if (backgroundColor.isDark()) {
							textColor = 'white';
						}
						return (
							<td
								key={'legend-for-' + item.title}
								style={{
									textAlign: 'center',
									verticalAlign: 'top',
									background: item.bg,
									color: textColor,
									paddingLeft: '3px',
									paddingTop: '0px',
									paddingBottom: '0px'
								}}
							>
								<div>{item.title}</div>
							</td>
						);
					})}
				</tr>
			</tbody>
		</table>
	);
};

export default Legend;
