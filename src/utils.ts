import sparkMD5 from "spark-md5";

export interface IEventRegistry {
  on(eventName: string, eventFn: (...args: any[]) => unknown): void;
  once(eventName: string, eventFn: (...args: any[]) => unknown): void;
  off(eventName: string, eventFn: (...args: any[]) => unknown): void;
  emit(eventName: string, ...args: any[]): void;
}

export class EventRegistry {
  private readonly eventMap: Record<string, ((...args: any[]) => unknown)[]>;

  constructor() {
    this.eventMap = {};
  }

  on(eventName: string, eventFn: (...args: any[]) => unknown) {
    let eventFns = this.eventMap[eventName];
    if (!eventFns) {
      eventFns = [];
      this.eventMap[eventName] = eventFns;
    }
    eventFns.push(eventFn);
  }

  once(eventName: string, eventFn: (...args: any[]) => unknown) {
    let eventFns = this.eventMap[eventName];
    if (!eventFns) {
      eventFns = [];
      this.eventMap[eventName] = eventFns;
    }
    const onceEventFn = (...args: any[]) => {
      eventFn(...args);
      this.off(eventName, onceEventFn);
    };
    eventFns.push(onceEventFn);
  }

  off(eventName: string, eventFn: (...args: any[]) => unknown) {
    const eventFns = this.eventMap[eventName];
    if (!eventFns) return;
    for (let i = 0; i < eventFns.length; i++) {
      const fn = eventFns[i];
      if (fn === eventFn) {
        eventFns.splice(i, 1);
        break;
      }
    }
    if (eventFns.length === 0) {
      delete this.eventMap[eventName];
    }
  }

  emit(eventName: string, ...args: any[]) {
    const eventFns = this.eventMap[eventName];
    if (!eventFns) return;
    eventFns.forEach((fn) => {
      fn(...args);
    });
  }
}

const eventRegistry: IEventRegistry = new EventRegistry();

export { eventRegistry };

/**
 * 计算文件的 MD5 哈希值
 * @param _file
 * @param chunkSize
 * @param onProgress
 */
function MD5(
  _file: File,
  chunkSize: number = 1024 * 1024 * 1,
  onProgress?: (progress: { currentChunk: number; chunks: number }) => void
) {
  return new Promise<string>((resolve, reject) => {
    const blobSlice = Blob.prototype.slice;
    const file = _file;
    const chunks = Math.ceil(file.size / chunkSize);
    const spark = new sparkMD5.ArrayBuffer();
    const fileReader = new FileReader();
    let currentChunk = 0;
    fileReader.onload = function (e: any) {
      spark.append(e.target.result);
      currentChunk++;
      if (onProgress) {
        onProgress({ currentChunk, chunks });
      }
      if (currentChunk < chunks) {
        loadNext();
      } else {
        resolve(spark.end());
      }
    };
    fileReader.onerror = function () {
      reject(
        new Error(
          `FileReader error: ${fileReader.error?.message || "Unknown error"}`
        )
      );
    };
    function loadNext() {
      const start = currentChunk * chunkSize;
      const end =
        start + chunkSize >= file.size ? file.size : start + chunkSize;
      fileReader.readAsArrayBuffer(blobSlice.call(file, start, end));
    }
    loadNext();
  });
}

export { MD5 };
