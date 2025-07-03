import { faX } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useRef } from "react";

interface FileUploaderProps {
  file: File | null;
  setFile: (file: File | null) => void;
}

const FileUploader = ({ file, setFile }: FileUploaderProps) => {
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
        style={{ display: file ? "none" : "block" }}
      />
      {file && (
        <div className="relative overflow-hidden bg-white isolate rounded-md flex justify-center items-center w-full aspect-[1.7777/1]">
          <FontAwesomeIcon
            className="absolute right-1 top-1 cursor-pointer z-50"
            onClick={() => {
              setFile(null);
              if (inputRef.current) {
                inputRef.current.value = "";
              }
            }}
            icon={faX}
          />
          <img
            className={`object-cover relative h-full overflow-clip w-[calc(130%+7.2px)]`}
            src={URL.createObjectURL(file)}
            alt="Preview"
          />
        </div>
      )}
    </div>
  );
};

export default FileUploader;
