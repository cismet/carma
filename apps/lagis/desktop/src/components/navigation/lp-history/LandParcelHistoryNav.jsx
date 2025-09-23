import React from 'react'
import { LeftCircleOutlined, RightCircleOutlined } from '@ant-design/icons';

function LandParcelHistoryNav() {
  return (
    <div className="flex gap-1 items-center">
      <LeftCircleOutlined />
      <div>Previous</div>
      <RightCircleOutlined />
      <div>Next</div>
    </div>
  )
}

export default LandParcelHistoryNav
