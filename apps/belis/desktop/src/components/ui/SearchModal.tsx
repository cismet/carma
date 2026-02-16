import { useState, useEffect } from "react";
import { Modal, Button } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { LeuchteSearch } from "./featuresSearches";

interface SearchModalProps {
  defaultOpen?: boolean;
}

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
        title="Leuchten Suche"
        open={isOpen}
        onCancel={() => setIsOpen(false)}
        footer={
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-500">
              Belis Desktop - Erweiterte Suche
            </span>
            <div className="flex gap-2">
              <Button onClick={() => setIsOpen(false)}>Abbrechen</Button>
              <Button type="primary" onClick={() => setIsOpen(false)}>
                Suchen
              </Button>
            </div>
          </div>
        }
        width={600}
        styles={{ body: { maxHeight: "70vh", overflowY: "auto" } }}
      >
        <LeuchteSearch onValuesChange={handleSearch} />
      </Modal>
    </>
  );
};

export default SearchModal;
