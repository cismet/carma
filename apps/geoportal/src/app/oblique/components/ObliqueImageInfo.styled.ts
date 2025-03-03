import { Card } from "antd";
import { styled } from "styled-components";

export const InfoCard = styled(Card)`
  position: absolute;
  bottom: 16px;
  right: 16px;
  max-width: 350px;
  z-index: 1000;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  padding: 0;
`;

export const InfoHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background-color: #1890ff;
  color: white;
  border-top-left-radius: 4px;
  border-top-right-radius: 4px;
`;

export const InfoTitle = styled.div`
  display: flex;
  align-items: center;
  font-weight: 500;
  flex-grow: 1;
`;

export const InfoRow = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 8px;
  &:last-child {
    margin-bottom: 0;
  }
`;

export const ImagePreviewContainer = styled.div`
  margin-top: 8px;
  margin-bottom: 8px;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
`;

export const ImagePlaceholder = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #f5f5f5;
  color: #999;
  width: 100%;
  height: 150px;
  border-radius: 4px;
  font-size: 14px;
`;
