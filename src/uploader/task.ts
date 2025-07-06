import { EventTypeEnum, UploaderOptions } from '.';
import { EventRegistry } from '../utils/event-registry';
import { TaskQueue } from '../utils/task-queue';
import { requestWithCancel } from '../xhr/request';
import { Chunk } from './chunk';

type TaskStatus = 'PARSING' | 'WAITING' | 'UPLOADING' | 'PAUSE' | 'SUCCESS' | 'FAIL' | 'MERGE';

type TaskOptions = UploaderOptions & { taskQueue: TaskQueue; eventRegistry: EventRegistry };

export class UploadTask {
  public id: string;

  public file: File;

  public chunks: Chunk[] = [];

  public uploadedChunks: Chunk[] = [];

  public status: TaskStatus = 'PARSING';

  public options: TaskOptions;

  constructor(id: string, file: File, options: TaskOptions) {
    this.id = id;
    this.file = file;
    this.options = options;
  }

  public bootstrap() {
    const { taskQueue, eventRegistry } = this.options;

    this.status = 'PARSING';
    eventRegistry.emit(EventTypeEnum.PROGRESS, this);

    // 生成分片记录
    this.generateChunks();

    this.status = 'WAITING';
    eventRegistry.emit(EventTypeEnum.PROGRESS, this);

    // 分片任务
    const tasks = [] as { fn: (signal?: AbortSignal) => Promise<any> }[];

    for (const chunk of this.chunks) {
      const myTask = async (signal?: AbortSignal) => {
        signal?.addEventListener('abort', () => {
          throw Error('Aborted during execution');
        });

        const fd = new FormData();
        fd.append('chunkNumber', chunk.chunkNumber.toString());
        fd.append('chunkSize', chunk.chunkSize.toString());
        fd.append('currentChunkSize', chunk.currentChunkSize.toString());
        fd.append('totalChunks', chunk.totalChunks.toString());
        fd.append('totalSize', chunk.file.size.toString());
        fd.append('identifier', chunk.identifier);
        fd.append('filename', chunk.filename);
        fd.append('file', chunk.file);

        const { request } = requestWithCancel({
          url: this.options.target,
          method: 'POST',
          headers: this.options.headers,
          data: fd
        });

        const result = await request;
        eventRegistry.emit(EventTypeEnum.SUCCESS, this);
        return result;
      };
      tasks.push({ fn: myTask });
    }

    // 主任务前置逻辑
    const mainTaskFn = async () => {
      this.status = 'UPLOADING';
      eventRegistry.emit(EventTypeEnum.PROGRESS, this);
    };
    const { promise } = taskQueue.enqueue(this.id, 3, tasks, mainTaskFn);
    promise
      .then(res => {
        eventRegistry.emit(EventTypeEnum.TASK_SUCCESS, this);
        console.log(res);
      })
      .catch(err => {
        eventRegistry.emit(EventTypeEnum.ERROR, err, this);
        console.log(err);
      });
  }

  public pause() {
    const { taskQueue } = this.options;
    taskQueue.cancelTask(this.id);
    console.log('pause');
  }

  public resume() {
    console.log('resume');
  }

  public abort() {
    console.log('abort');
  }

  public rerty() {
    console.log('rerty');
  }

  /**
   * 文件分片
   */
  private generateChunks() {
    this.chunks = [];
    const { chunkSize } = this.options;
    let count = Math.ceil(this.file.size / chunkSize!);
    // 空文件
    if (count === 0) {
      count = 1;
    }
    let index = 0;
    const _file = this.file;
    while (index < count) {
      const chunkFile = _file.slice(index * chunkSize!, (index + 1) * chunkSize!);
      const filename = _file.name;
      const chunk = new Chunk(index + 1, chunkSize!, chunkFile.size, this.id, filename, count, chunkFile);
      this.chunks.push(chunk);
      index++;
    }
  }
}
