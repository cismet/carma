import { useState, useEffect } from "react";
import { Modal, Button } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { LeuchteSearch, MastSearch } from "./featuresSearches";

interface SearchModalProps {
  defaultOpen?: boolean;
}

const SearchModalHeader = ({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) => (
  <div className="flex items-center gap-3">
    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
      <SearchOutlined className="text-xl text-blue-600" />
    </div>
    <div>
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      <p className="text-sm text-gray-500">{subtitle}</p>
    </div>
  </div>
);

const SearchModal = ({ defaultOpen = false }: SearchModalProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  useEffect(() => {
    setIsOpen(defaultOpen);
  }, [defaultOpen]);

  const handleSearch = (values: unknown) => {
    console.log("Search values:", values);
    // TODO: Implement search functionality
  };

  return (
    <>
      <Button
        type="text"
        icon={<SearchOutlined />}
        onClick={() => setIsOpen(true)}
        title="Erweiterte Suche"
      >
        Suche
      </Button>

      <Modal
        title={
          <SearchModalHeader
            title="Leuchten Suche"
            subtitle="Erweiterte Filteroptionen"
          />
        }
        open={isOpen}
        onCancel={() => setIsOpen(false)}
        footer={
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button onClick={() => setIsOpen(false)}>Abbrechen</Button>
            <Button type="primary" onClick={() => setIsOpen(false)}>
              Suchen
            </Button>
          </div>
        }
        width={600}
        styles={{
          body: { paddingTop: 16 },
          header: { borderBottom: "1px solid #f3f4f6", paddingBottom: 16 },
        }}
      >
        <MastSearch onValuesChange={handleSearch} />
        {/* <LeuchteSearch onValuesChange={handleSearch} /> */}
      </Modal>
    </>
  );
};

export default SearchModal;
