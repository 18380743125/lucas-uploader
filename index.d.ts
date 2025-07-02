interface UploaderConfig {
  target: string;
  fileParameterName?: string;
  singleFile?: boolean;
  method?: "multipart";
  headers?: Record<string, string>;
  withCredentials?: boolean;
  simultaneousUploads?: number;
  chunkFlag?: boolean;
  chunkSize?: number;
}

type EventType = "added" | "progress" | "success" | "complete" | "error";
