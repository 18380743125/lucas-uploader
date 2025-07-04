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

  public status: TaskStatus = 'PARSING';

  public options: TaskOptions;

  constructor(id: string, file: File, options: TaskOptions) {
    this.id = id;
    this.file = file;
    this.options = options;
  }

  public bootstrap() {
    this.status = 'PARSING';

    const { taskQueue, eventRegistry } = this.options;

    // 生成分片记录
    this.generateChunks();

    this.status = 'WAITING';

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

        return await request
      };
      tasks.push({ fn: myTask });
    }

    const { id, promise } = taskQueue.enqueue(this.id, 3, tasks);
  }

  public pause() {
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
    const file = this.file;
    let count = Math.ceil(file.size / chunkSize!);
    // 空文件
    if (count === 0) {
      count = 1;
    }
    let index = 0;
    const suffix = /\.(\w+)$/.exec(file.name)?.[1];
    while (index < count) {
      const chunkFile = file.slice(index * chunkSize!, (index + 1) * chunkSize!);
      const filename = `${this.id}_${index + 1}.${suffix}`;
      const chunk = new Chunk(index + 1, chunkSize!, chunkFile.size, this.id, filename, count, chunkFile);
      this.chunks.push(chunk);
      index++;
    }
  }
}
