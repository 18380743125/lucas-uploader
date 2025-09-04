import { EventRegistry } from '../utils/event-registry';
import { TaskQueue } from '../utils/task-queue';
import { UploadTask } from './task';

export interface UploaderOptions {
  // 上传目标地址
  target: string;

  // 上传文件参数名
  fileParameterName?: string;

  // 是否单文件上传
  singleFile?: boolean;

  // 请求头
  headers?: Record<string, string>;

  // 是否携带 Cookie
  withCredentials?: boolean;

  // 同时上传文件数量
  simultaneousUploads: number;

  // 分片上传
  chunkFlag?: boolean;

  // 分片大小
  chunkSize?: number;

  // 单一文件的分片上传并发限制
  chunkSimultaneousUploads: number;

  // 文件上传额外参数
  getParams?: (file: File | Blob) => Record<string, any>;
}

// 文件上传事件
export type EventType = 'added' | 'progress' | 'success' | 'merge' | 'complete' | 'error' | 'warning';

export enum EventTypeEnum {
  ADDED = 'added',

  PROGRESS = 'progress',

  SUCCESS = 'success',

  ERROR = 'error',

  MERGE = 'merge',

  TASK_SUCCESS = 'task-success',

  TASK_CANCEL = 'task-cancel',

  COMPLETE = 'complete',

  WARNING = 'warning'
}

export enum UploadWarningEnum {
  FILE_EXISTING = 'file-existing'
}

const defaultConfig: UploaderOptions = {
  target: '/',
  fileParameterName: 'file',
  singleFile: false,
  headers: {},
  withCredentials: false,
  simultaneousUploads: 3,
  chunkFlag: true,
  chunkSize: 512 * 1024,
  chunkSimultaneousUploads: 5
};

export class LucasUploader {
  private readonly options: UploaderOptions;

  private readonly taskList: UploadTask[] = [];

  private readonly uploadTaskQueue: TaskQueue;

  private readonly eventRegistry: EventRegistry;

  constructor(options: UploaderOptions = defaultConfig) {
    this.options = { ...defaultConfig, ...options };

    const { simultaneousUploads } = this.options;

    this.uploadTaskQueue = new TaskQueue(simultaneousUploads);

    this.eventRegistry = new EventRegistry();

    // 监听上传任务完成
    this.eventRegistry.on(EventTypeEnum.TASK_SUCCESS, (_result, task: UploadTask) => {
      this.removeTask(task, EventTypeEnum.TASK_SUCCESS);
    });

    // 监听文件合并事件
    this.eventRegistry.on(EventTypeEnum.MERGE, (task: UploadTask) => {
      this.removeTask(task);
    });

    // 监听上传任务取消
    this.eventRegistry.on(EventTypeEnum.TASK_CANCEL, (task: UploadTask) => {
      this.removeTask(task);
    });
  }

  public on(eventName: EventType, eventFn: (...args: any[]) => unknown) {
    this.eventRegistry.on(eventName, eventFn);
  }

  public off(eventName: EventType, eventFn: (...args: any[]) => unknown) {
    this.eventRegistry.off(eventName, eventFn);
  }

  /**
   * 指定 DOM 元素绑定文件选择功能
   * @param DOM
   */
  public assignBrowse(DOM: HTMLElement) {
    let input: HTMLInputElement;
    if (DOM instanceof HTMLInputElement && DOM.type == 'file') {
      input = DOM;
    } else {
      input = document.createElement('input');
      input.setAttribute('type', 'file');
      input.style.cssText = `
        visibility: hidden;
        position: absolute;
        width: 0;
        height: 0;
      `;
      DOM.appendChild(input);
      DOM.addEventListener('click', function () {
        input.value = '';
        input.click();
      });
    }
    if (this.options.singleFile === true) {
      input.removeAttribute('multiple');
    } else {
      input.setAttribute('multiple', 'multiple');
    }
    input.addEventListener('change', e => {
      const target = e.target as HTMLInputElement;
      if (target.files?.length) {
        const files = Array.from(target.files);
        this.createTask(files, e);
      }
      target.value = '';
    });
  }

  /**
   * 指定 DOM 元素绑定文件拖拽功能
   * @param DOM
   */
  public assignDrop(DOM: HTMLElement) {
    DOM.addEventListener('dragover', e => {
      e.preventDefault();
    });
    DOM.addEventListener('drop', e => {
      e.preventDefault();
      const tempFiles = e.dataTransfer?.files;
      if (!tempFiles?.length) {
        return;
      }
      let first = tempFiles[0];

      let files: File[] = [];
      if (this.options.singleFile) {
        files = [first];
      } else {
        files = Array.from(tempFiles);
      }
      this.createTask(files, e);
    });
  }

  /**
   * 添加文件
   * @param files 选择的文件
   * @param e 事件对象
   */
  private async createTask(files: File[], e: Event) {
    const currentTasks: UploadTask[] = [];
    const existTaskList: UploadTask[] = [];

    for (const file of files) {
      const findTask = this.taskList.find(task => task.file.name === file.name);
      if (!findTask) {
        const task = new UploadTask(file, {
          ...this.options,
          taskQueue: this.uploadTaskQueue,
          eventRegistry: this.eventRegistry
        });

        currentTasks.push(task);
        this.taskList.push(task);
      } else {
        existTaskList.push(findTask);
      }
    }

    if (currentTasks.length) {
      this.eventRegistry.emit(EventTypeEnum.ADDED, currentTasks, this.taskList, e);
    }

    if (existTaskList.length) {
      this.eventRegistry.emit(EventTypeEnum.WARNING, UploadWarningEnum.FILE_EXISTING, existTaskList);
    }
  }

  private removeTask(task: UploadTask, type?: EventTypeEnum) {
    task && this.taskList.splice(this.taskList.indexOf(task), 1);

    // 所有任务完成
    if (type === EventTypeEnum.SUCCESS && this.taskList.length === 0) {
      this.eventRegistry.emit(EventTypeEnum.COMPLETE, this);
    }
  }
}
