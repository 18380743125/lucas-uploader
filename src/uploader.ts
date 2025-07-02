import eventRegistry, { IEventRegistry } from "./event";

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
      node.addEventListener(
        "click",
        function () {
          input.click();
        },
        false
      );
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

  public assignDrop() {}

  private addFiles(files: FileList, e: Event) {}
}
