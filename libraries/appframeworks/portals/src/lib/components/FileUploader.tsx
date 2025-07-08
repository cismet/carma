import { faUpload, faX } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Button } from "antd";
import { useRef } from "react";

interface FileUploaderProps {
  file: File | string | null;
  setFile: (file: File | null) => void;
}

export const FileUploader = ({ file, setFile }: FileUploaderProps) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
    }
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        onChange={handleFileChange}
        accept="image/*"
        className="sr-only"
      />
      {file ? (
        <div className="relative overflow-hidden bg-white isolate rounded-md flex justify-center items-center w-full aspect-[1.7777/1]">
          <Button
            onClick={() => {
              setFile(null);
              if (inputRef.current) {
                inputRef.current.value = "";
              }
            }}
            className="absolute right-1 top-1 cursor-pointer z-50"
            type="text"
            size="small"
          >
            <FontAwesomeIcon icon={faX} className="shadow-lg shadow-white" />
          </Button>
          <img
            className={`object-cover relative h-full overflow-clip w-[calc(130%+7.2px)]`}
            src={file instanceof File ? URL.createObjectURL(file) : file}
            alt="Preview"
          />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-md border border-dashed p-6 text-center w-full aspect-[1.7777/1]">
          <FontAwesomeIcon className="text-2xl text-gray-600" icon={faUpload} />
          <p className="mt-2 text-md text-gray-600">Datei hochladen</p>
          <div className="mt-4">
            <Button
              onClick={() => {
                if (inputRef.current) {
                  inputRef.current.click();
                }
              }}
            >
              Datei Auswählen
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileUploader;
