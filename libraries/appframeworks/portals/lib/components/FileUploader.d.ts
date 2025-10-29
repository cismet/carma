interface FileUploaderProps {
  file: File | string | null;
  setFile: (file: File | null) => void;
}
export declare const FileUploader: ({
  file,
  setFile,
}: FileUploaderProps) => import("react/jsx-runtime").JSX.Element;
export default FileUploader;
