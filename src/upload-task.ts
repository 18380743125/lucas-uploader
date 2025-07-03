import { UploaderOptions } from "./uploader";

export interface IUploadTask {
  id: string;
  bootstrap(): void;
  pause(): void;
  resume(): void;
  abort(): void;
  rerty(): void;
}

type TaskOptions = Omit<UploaderOptions, "singleFile">;

export class UploadTask {
  public id: string;

  public file: File;

  public options: TaskOptions;

  constructor(id: string, file: File, options: TaskOptions) {
    this.id = id;
    this.file = file;
    this.options = options;
  }

  public bootstrap() {
    console.log(this);
  }

  public pause() {
    console.log("pause");
  }

  public resume() {
    console.log("resume");
  }

  public abort() {
    console.log("abort");
  }

  public rerty() {
    console.log("rerty");
  }
}
