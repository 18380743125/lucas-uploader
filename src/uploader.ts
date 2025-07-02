import eventRegistry, { IEventRegistry } from "./event";

export interface UploaderConfig {
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

export type EventType = "added" | "progress" | "success" | "complete" | "error";

const defaultConfig: UploaderConfig = {
  target: "/",
  fileParameterName: "file",
  singleFile: false,
  method: "multipart",
  headers: {},
  withCredentials: false,
  simultaneousUploads: 3,
  chunkFlag: true,
  chunkSize: 1 * 1024 * 1024,
};

export class Uploader {
  private readonly config: UploaderConfig;

  private readonly event: IEventRegistry;

  constructor(config: UploaderConfig = defaultConfig) {
    this.config = config;
    this.event = eventRegistry;
  }

  on(eventName: EventType, eventFn: (...args: any[]) => unknown) {
    this.event.on(eventName, eventFn);
  }

  off(eventName: EventType, eventFn: (...args: any[]) => unknown) {
    this.event.off(eventName, eventFn);
  }

  /**
   * 指定 DOM 元素绑定文件选择功能
   * @param node
   */
  public assignBrowse(node: HTMLElement) {
    let input: HTMLInputElement;
    if (node instanceof HTMLInputElement && node.type == "file") {
      input = node;
    } else {
      input = document.createElement("input");
      input.setAttribute("type", "file");
      input.style.cssText = `
        visibility: hidden;
        position: absolute;
        width: 0;
        height: 0;
      `;
      node.appendChild(input);
      node.addEventListener("click", function () {
        input.click();
      });
    }
    if (!this.config.singleFile) {
      input.setAttribute("multiple", "multiple");
    }
    input.addEventListener("change", (e) => {
      const target = e.target as HTMLInputElement;
      if (target.files?.length) {
        this.addFiles(target.files, e);
      }
    });
  }

  public assignDrop(node: HTMLElement) {
    node.addEventListener("dragover", (e) => {
      e.preventDefault();
    });
    node.addEventListener("drop", (e) => {
      e.preventDefault();
      if (!e.dataTransfer?.files?.length) {
        return;
      }
      let first = e.dataTransfer?.files[0];

      let fileList: File[] = [];
      if (this.config.singleFile) {
        fileList = [first];
      } else {
        for (let i = 0; i < e.dataTransfer?.files?.length; i++) {
          fileList.push(e.dataTransfer.files[i]);
        }
      }
      console.log(fileList);
    });
  }

  private addFiles(files: FileList, e: Event) {}
}
