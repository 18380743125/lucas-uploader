type MainTaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'canceled';

export type SubTaskFn<T = unknown> = {
  (): Promise<T>;

  cancel?: () => void;
};

export interface SubTask<T = unknown> {
  id: string;

  fn: SubTaskFn<T>;
}

export interface MainTaskRecord<T = any> {
  id: string; // 主任务 ID

  mainTaskPreFn?: () => Promise<void>; // 主任务前置逻辑

  subTasks: SubTask[]; // 子任务列表

  subConcurrentSize: number; // 子任务并发数

  status: MainTaskStatus; // 主任务状态

  controller: AbortController; // 主任务控制器

  resolve: (value: T) => void;

  reject: (reason?: unknown) => void;
}

/**
 * 任务调度器：主任务与子任务的双层并发
 */
export class TaskQueue {
  private readonly maxConcurrent: number; // 主任务最大并发数

  private running: number; // 当前运行的主任务数

  private queue: MainTaskRecord[]; // 主任务等待队列

  private taskMap: Map<string, MainTaskRecord>; // id - 主任务映射

  constructor(maxConcurrent = 3) {
    this.maxConcurrent = maxConcurrent;
    this.running = 0;
    this.queue = [];
    this.taskMap = new Map();
  }

  /**
   * 添加主任务
   * @param id 主任务唯一标识
   * @param subConcurrentSize 子任务并发数
   * @param subTasks 子任务数组
   * @param mainTaskPreFn 主任务前置逻辑
   */
  public enqueue<T>(
    id: string,
    subConcurrentSize: number,
    subTasks: Omit<SubTask, 'id'>[],
    mainTaskPreFn?: () => Promise<void>
  ): Promise<T> {
    if (this.taskMap.has(id)) {
      throw new Error(`Main Task ${id} already exists`);
    }

    const subTaskList: SubTask[] = subTasks.map((sub, index) => ({
      id: `${id}_sub${index + 1}`,
      fn: sub.fn
    }));

    let resolve: (value: T) => void = () => {};
    let reject: (reason?: any) => void = () => {};

    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });

    const taskRecord: MainTaskRecord = {
      id,
      subConcurrentSize,
      subTasks: subTaskList,
      mainTaskPreFn,
      status: 'pending',
      controller: new AbortController(),
      resolve,
      reject
    };

    this.queue.push(taskRecord);
    this.taskMap.set(id, taskRecord);

    this.dequeue();

    return promise;
  }

  /**
   * 取消任务
   */
  public cancelTask(id: string, reason?: string) {
    const task = this.taskMap.get(id);

    if (!task) {
      return null;
    }

    task.subTasks.forEach(subtask => {
      subtask.fn.cancel?.();
    });

    task.controller.abort();

    // 从队列中移除
    task.status = 'canceled';
    this.queue = this.queue.filter(item => item.id !== id);
    this.taskMap.delete(id);

    task.reject(reason || 'canceled');

    return task;
  }

  /**
   * 主任务并发调度
   */
  private dequeue() {
    while (this.running < this.maxConcurrent && this.queue.length > 0) {
      const task = this.queue.shift()!;
      this.running++;
      this.executeMainTask(task);
    }
  }

  /**
   * 执行主任务
   */
  private async executeMainTask(task: MainTaskRecord) {
    task.status = 'running';

    try {
      // 主任务前置逻辑
      if (task.mainTaskPreFn) await task.mainTaskPreFn();

      // 执行子任务队列
      const results = await this.runSubTasks(task);

      task.status = 'completed';
      task.resolve(results);
    } catch (err) {
      task.status = 'failed';
      task.reject(err);
    } finally {
      this.running--;
      this.taskMap.delete(task.id);

      // 继续执行下一个任务
      this.dequeue();
    }
  }

  /**
   * 子任务并发调度
   */
  private async runSubTasks(task: MainTaskRecord) {
    const { subTasks, subConcurrentSize, controller } = task;
    const results: any[] = [];
    let activeCount = 0;
    let index = 0;
    let hasError = false;

    while (index < subTasks.length || activeCount > 0) {
      // 1、填充并发槽
      while (index < subTasks.length && activeCount < subConcurrentSize && !hasError) {
        if (controller.signal.aborted) {
          hasError = true;
          break;
        }

        const subTask = subTasks[index++];
        activeCount++;

        // 异步执行子任务
        subTask
          .fn()
          .then(result => {
            results.push(result);
          })
          .catch(err => {
            hasError = true;
            subTask.fn.cancel?.();
            controller.abort();
            throw new Error(`Subtask ${subTask.id} failed: ${err}`);
          })
          .finally(() => {
            activeCount--;
          });
      }

      // 2、短时间让出控制权
      if (activeCount > 0 && !hasError) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // 3、错误或终止检测
      if (hasError || controller.signal.aborted) {
        throw new Error('Subtask execution aborted');
      }
    }
    return results;
  }
}
