export declare const uploadImage: ({
  file,
  apiUrl,
  jwt,
  messageApi,
}: {
  file: File;
  apiUrl?: string;
  jwt?: string;
  messageApi?: any;
}) => Promise<string>;
