type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';

export type TaskFn<T = any> = {
  (signal?: AbortSignal): Promise<T>;
  cancel?: () => void;
};

export interface SubTask<T = any> {
  id: string;
  fn: TaskFn<T>;
}

export interface TaskRecord<T = any> {
  id: string; // 主任务 ID
  mainTaskFn?: () => Promise<void>; // 主任务前置逻辑
  subTasks: SubTask[]; // 子任务列表
  subConcurrent: number; // 子任务并发数
  status: TaskStatus; // 任务状态
  controller: AbortController;
  resolve: (value: T) => void;
  reject: (reason?: any) => void;
}

/**
 * 主任务 + 子任务的双层并发队列
 */
export class TaskQueue {
  private readonly maxConcurrent: number; // 主任务最大并发数
  private running: number; // 当前运行的主任务数
  private queue: TaskRecord[]; // 主任务等待队列
  private taskMap: Map<string, TaskRecord>; // 主任务状态

  constructor(maxConcurrent = 3) {
    this.maxConcurrent = maxConcurrent;
    this.running = 0;
    this.queue = [];
    this.taskMap = new Map();
  }

  /**
   * 添加主任务
   * @param id 主任务唯一标识
   * @param subConcurrent 子任务并发数
   * @param subTasks 子任务数组
   * @param mainTaskFn 主任务前置逻辑
   */
  public enqueue<T>(
    id: string,
    subConcurrent: number,
    subTasks: Omit<SubTask, 'id'>[],
    mainTaskFn?: () => Promise<void>
  ): Promise<T> {
    if (this.taskMap.has(id)) {
      throw new Error(`Task ${id} already exists`);
    }

    const controller = new AbortController();
    const subTaskInstances: SubTask[] = subTasks.map((sub, index) => ({
      id: `${id}_sub${index + 1}`,
      fn: sub.fn
    }));

    let resolve: (value: T) => void = () => {};
    let reject: (reason?: any) => void = () => {};

    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });

    const taskRecord: TaskRecord = {
      id,
      mainTaskFn,
      subTasks: subTaskInstances,
      subConcurrent,
      status: 'pending',
      controller,
      resolve,
      reject
    };

    this.queue.push(taskRecord);
    this.taskMap.set(id, taskRecord);
    this.dequeue();

    return promise;
  }

  /**
   * 取消任务 包括取消子任务
   */
  public cancelTask(id: string) {
    const task = this.taskMap.get(id);
    if (!task) return;

    task.controller.abort();
    task.status = 'failed';
    task.reject('Task aborted by user');
    this.taskMap.delete(id);

    // 从队列中移除
    this.queue = this.queue.filter(item => item.id !== id);

    return task
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
  private async executeMainTask(task: TaskRecord) {
    task.status = 'running';

    try {
      // 执行主任务前置逻辑
      if (task.mainTaskFn) await task.mainTaskFn();

      // 执行子任务队列
      const results = await this.runSubtasks(task);
      task.resolve(results);
      task.status = 'completed';
    } catch (err) {
      task.status = 'failed';
      task.reject(err);
    } finally {
      this.running--;
      this.taskMap.delete(task.id);
      // 执行下一个主任务
      this.dequeue();
    }
  }

  /**
   * 子任务并发调度
   */
  private async runSubtasks(task: TaskRecord) {
    const { subTasks, subConcurrent, controller } = task;
    const results: any[] = [];
    let activeCount = 0;
    let index = 0;
    let hasError = false;

    while (index < subTasks.length || activeCount > 0) {
      // 1.填充并发槽
      while (activeCount < subConcurrent && index < subTasks.length && !hasError) {
        if (controller.signal.aborted) {
          hasError = true;
          break;
        }

        const subtask = subTasks[index++];
        activeCount++;

        // 异步执行子任务
        subtask
          .fn(controller.signal)
          .then(result => {
            results.push(result);
          })
          .catch(err => {
            hasError = true;
            // 终止所有子任务
            controller.abort();
            throw new Error(`Subtask ${subtask.id} failed: ${err}`);
          })
          .finally(() => {
            activeCount--; // 任务完成，释放并发槽
          });
      }

      // 2.短时间让出控制权（避免空转）
      if (activeCount > 0 && !hasError) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // 3.错误或终止检测
      if (hasError || controller.signal.aborted) {
        throw new Error('Subtask execution aborted');
      }
    }
    return results; // 返回所有子任务结果
  }
}
