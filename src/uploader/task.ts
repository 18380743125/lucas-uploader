import { EventTypeEnum, UploaderOptions } from '.';
import { EventRegistry } from '../utils/event-registry';
import { SubTask, TaskFn, TaskQueue } from '../utils/task-queue';
import { request, requestWithCancel } from '../xhr/request';
import { Chunk } from './chunk';

type TaskOptions = UploaderOptions & { taskQueue: TaskQueue; eventRegistry: EventRegistry };

type ChunkTasks = Omit<SubTask<any>, 'id'>[];

type StatusItem = {
  code: number;
  text: string;
};

type FileStatus = {
  PARSING: StatusItem;
  WAITING: StatusItem;
  UPLOADING: StatusItem;
  PAUSE: StatusItem;
  SUCCESS: StatusItem;
  FAIL: StatusItem;
};

export const fileStatus: FileStatus = {
  PARSING: {
    code: 1,
    text: '解析中'
  },
  WAITING: {
    code: 2,
    text: '等待上传'
  },
  UPLOADING: {
    code: 3,
    text: '正在上传'
  },
  PAUSE: {
    code: 4,
    text: '暂停上传'
  },
  SUCCESS: {
    code: 5,
    text: '上传成功'
  },
  FAIL: {
    code: 6,
    text: '上传失败'
  }
};

export interface TaskProgress {
  speed: number;

  percentage: number;

  uploadedSize: number;

  timeRemaining: number;
}

export class UploadTask {
  public identifier: string;

  public file: File;

  public chunks: Chunk[] = [];

  public uploadedChunkNumber: number[] = [];

  public status: StatusItem = fileStatus.PARSING;

  public options: TaskOptions;

  public progress: TaskProgress = {
    speed: 0,
    percentage: 0,
    uploadedSize: 0,
    timeRemaining: 0
  };

  constructor(identifier: string, file: File, options: TaskOptions) {
    this.identifier = identifier;
    this.file = file;
    this.options = options;
  }

  /**
   * 启动任务
   */
  public bootstrap() {
    const { eventRegistry } = this.options;

    this.status = fileStatus.PARSING;
    eventRegistry.emit(EventTypeEnum.PROGRESS, this);

    this.chunkTask();
  }

  /**
   * 暂停任务
   */
  public pause() {
    const { taskQueue } = this.options;

    if (this.status === fileStatus.UPLOADING) {
      taskQueue.cancelTask(this.identifier);
      this.status = fileStatus.PAUSE;
    }
  }

  /**
   * 继续任务
   */
  public resume() {
    if (this.status === fileStatus.PAUSE) {
      this.pushTaskQueue();
    }
  }

  /**
   * 重试
   */
  public rerty() {
    this.pushTaskQueue();
  }

  /**
   * 取消任务
   */
  public abort() {
    const { taskQueue, eventRegistry } = this.options;

    const task = taskQueue.cancelTask(this.identifier);

    if (task) {
      // 取消请求
      task.subTasks.forEach(subTask => {
        subTask.fn.cancel?.();
      });

      task.status = 'failed';
    }

    eventRegistry.emit(EventTypeEnum.TASK_CANCEL, this);
  }

  /**
   * 分片上传任务
   */
  private async chunkTask() {
    const { eventRegistry } = this.options;

    // 查询已查询的分片
    try {
      const uploadedChunks = await this.getUploadedChunkNumber();
      this.uploadedChunkNumber = uploadedChunks;
    } catch (err) {
      eventRegistry.emit(EventTypeEnum.ERROR, err, this);
      return;
    }

    // 生成分片记录
    this.generateChunks();

    // 添加进任务队列
    this.pushTaskQueue();
  }

  /**
   * 加入任务队列
   */
  private pushTaskQueue(): void {
    const { eventRegistry, taskQueue, simultaneousUploads, chunkFlag } = this.options;

    this.status = fileStatus.WAITING;
    eventRegistry.emit(EventTypeEnum.PROGRESS, this);

    if (this.chunks.length === this.uploadedChunkNumber.length && chunkFlag) {
      eventRegistry.emit(EventTypeEnum.MERGE, this);
      return;
    }

    // 生成分片任务
    const tasks = this.generateChunkTask();

    // 主任务前置逻辑
    const mainTaskFn = async () => {
      this.status = fileStatus.UPLOADING;
      eventRegistry.emit(EventTypeEnum.PROGRESS, this);
    };

    const promise = taskQueue.enqueue(this.identifier, simultaneousUploads, tasks, mainTaskFn);

    promise
      .then(res => {
        this.status = fileStatus.SUCCESS;
        eventRegistry.emit(EventTypeEnum.TASK_SUCCESS, res, this);
      })
      .catch(err => {
        this.status = fileStatus.FAIL;
        eventRegistry.emit(EventTypeEnum.ERROR, err, this);
      });
  }

  /**
   * 生成分片任务
   */
  private generateChunkTask(): ChunkTasks {
    const { eventRegistry, getParams } = this.options;

    const tasks: Omit<SubTask, 'id'>[] = [];

    let totalUploaded = 0;
    let lastUpdateTime = Date.now();
    let lastUploaded = 0;
    let speed = 0;
    let speeds: number[] = [];

    for (const chunk of this.chunks) {
      // 当前分片已上传了（续传）
      if (this.uploadedChunkNumber.includes(chunk.chunkNumber)) {
        chunk.status = 'success';
        totalUploaded += chunk.currentChunkSize;
      }

      if (chunk.status === 'success') {
        continue;
      }

      chunk.status = 'pending';

      const myTask: TaskFn = async (signal?: AbortSignal) => {
        signal?.addEventListener('abort', () => {
          throw Error('Aborted during execution');
        });

        const params = getParams?.(chunk.file);

        const fd = new FormData();
        fd.set('chunkNumber', chunk.chunkNumber.toString());
        fd.set('chunkSize', chunk.chunkSize.toString());
        fd.set('currentChunkSize', chunk.currentChunkSize.toString());
        fd.set('totalChunks', chunk.totalChunks.toString());
        fd.set('totalSize', chunk.file.size.toString());
        fd.set('identifier', chunk.identifier);
        fd.set('filename', chunk.filename);
        fd.set('file', chunk.file);

        if (params && Object.keys(params).length) {
          for (const [key, value] of Object.entries(params)) {
            fd.set(key, value);
          }
        }

        const onUploadProgress = (progressEvent: ProgressEvent) => {
          if (progressEvent.lengthComputable) {
            // 当前分片已上传的字节数
            const chunkUploaded = progressEvent.loaded;
            // 当前分片总字节数
            const chunkTotal = progressEvent.total;

            const currentTotalUploaded = totalUploaded + chunkUploaded;
            const totalSize = this.file.size;
            const percentage = Number((currentTotalUploaded / totalSize).toFixed(6));

            const now = Date.now();
            const timeDiff = (now - lastUpdateTime) / 1000;
            const uploadedDiff = chunkTotal - lastUploaded;

            if (timeDiff > 0) {
              speed = uploadedDiff / timeDiff;
              if (speeds.length >= 5) {
                speeds.shift();
              }
              speeds.push(speed);
              const averageSpeed = speeds.reduce((a, b) => a + b, 0) / Math.min(5, speeds.length);

              const remainingBytes = totalSize - currentTotalUploaded;
              const timeRemaining = averageSpeed > 0 ? remainingBytes / averageSpeed : 0;

              this.progress = {
                speed: averageSpeed,
                percentage,
                uploadedSize: totalUploaded,
                timeRemaining
              };

              eventRegistry.emit(EventTypeEnum.PROGRESS, this);
            }

            lastUpdateTime = now;
            lastUploaded = chunkUploaded;
          }
        };

        const { requestPromise, cancel } = requestWithCancel(
          {
            url: this.options.target,
            method: 'POST',
            headers: this.options.headers,
            data: fd
          },
          onUploadProgress
        );

        myTask.cancel = cancel;

        const result = await requestPromise;

        totalUploaded += chunk.currentChunkSize;
        chunk.status = 'success';

        eventRegistry.emit(EventTypeEnum.SUCCESS, result, this);

        return result;
      };

      tasks.push({ fn: myTask });
    }

    return tasks;
  }

  /**
   * 查询已上传的分片编号
   */
  private async getUploadedChunkNumber(): Promise<number[]> {
    const { chunkFlag } = this.options;
    if (!chunkFlag) {
      console.log('xxx');

      return [];
    }

    const params = this.options.getParams?.(this.file) || {};

    const result: any = await request({
      url: this.options.target,
      method: 'GET',
      headers: this.options.headers,
      params: {
        ...params,
        identifier: this.identifier
      }
    });

    const uploadedChunks = result.data.uploadedChunks;
    return uploadedChunks;
  }

  /**
   * 生成分片记录
   */
  private generateChunks(): void {
    const { chunkSize, chunkFlag } = this.options;

    this.chunks = [];
    const _file = this.file;

    if (chunkFlag) {
      // 总分片数
      let count = Math.ceil(_file.size / chunkSize!);

      // 空文件
      if (count === 0) {
        count = 1;
      }

      let index = 0;

      while (index < count) {
        const chunkFile = _file.slice(index * chunkSize!, (index + 1) * chunkSize!);
        const chunkNumber = index + 1;
        const chunk = new Chunk(chunkNumber, chunkSize!, chunkFile.size, this.identifier, _file.name, count, chunkFile);
        this.chunks.push(chunk);
        index++;
      }
    } else {
      const chunk = new Chunk(1, _file.size, _file.size, this.identifier, _file.name, 1, _file);
      this.chunks.push(chunk);
    }
  }
}
