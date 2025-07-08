import { EventRegistry } from '../utils/event-registry';
import { MD5 } from '../utils/md5';
import { TaskQueue } from '../utils/task-queue';
import { UploadTask } from './task';

export interface UploaderOptions {
  // 上传目标地址
  target: string;
  // 上传文件参数名
  fileParameterName?: string;
  // 是否单文件上传
  singleFile?: boolean;
  // 上传方式
  method?: 'multipart';
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
  // 文件上传额外参数
  getParams?: (file: File | Blob) => Record<string, any>;
}

// 文件上传事件
export type EventType = 'added' | 'progress' | 'success' | 'complete' | 'error' | 'merge';

export enum EventTypeEnum {
  ADDED = 'added',
  PROGRESS = 'progress',
  SUCCESS = 'success',
  MERGE = 'merge',
  COMPLETE = 'complete',
  ERROR = 'error',
  TASK_SUCCESS = 'task-success',
  TASK_CANCEL = 'task-cancel'
}

const defaultConfig: UploaderOptions = {
  target: '/',
  fileParameterName: 'file',
  singleFile: false,
  method: 'multipart',
  headers: {},
  withCredentials: false,
  simultaneousUploads: 3,
  chunkFlag: true,
  chunkSize: 512 * 1024
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

    // 监听任务是否完成
    this.eventRegistry.on(EventTypeEnum.TASK_SUCCESS, (_result, task: UploadTask) => {
      task && this.taskList.splice(this.taskList.indexOf(task), 1);
      if (this.taskList.length === 0) {
        this.eventRegistry.emit(EventTypeEnum.COMPLETE, this);
      }
    });

    // 监听任务取消
    this.eventRegistry.on(EventTypeEnum.TASK_CANCEL, (task: UploadTask) => {
      this.taskList.splice(this.taskList.indexOf(task), 1);
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
        input.click();
      });
    }
    if (!this.options.singleFile) {
      input.setAttribute('multiple', 'multiple');
    }
    input.addEventListener('change', e => {
      const target = e.target as HTMLInputElement;
      if (target.files?.length) {
        const files = Array.from(target.files);
        this.createTask(files, e);
      }
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
    for (const file of files) {
      const identifier = await MD5(file);
      const findTask = this.taskList.find(task => task.identifier === identifier);
      if (!findTask) {
        const task = new UploadTask(identifier, file, {
          ...this.options,
          taskQueue: this.uploadTaskQueue,
          eventRegistry: this.eventRegistry
        });
        currentTasks.push(task);
        this.taskList.push(task);
      }
    }
    if (currentTasks.length) {
      this.eventRegistry.emit(EventTypeEnum.ADDED, currentTasks, this.taskList, e);
      currentTasks.forEach(task => task.bootstrap());
    }
  }
}
