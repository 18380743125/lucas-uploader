interface QueueItem {
  id: string;
  fn: Function;
  controller: AbortController;
  resolve: (value: unknown) => void;
  reject: (reason?: any) => void;
}

export class ConcurrentQueue {
  // 最大并发数
  private maxConcurrent: number;

  // 当前运行中的任务数
  private running: number;

  // 任务等待队列
  private queue: QueueItem[];

  private taskMap: Map<string, Record<string, any>>;

  constructor(maxConcurrent = 6) {
    this.maxConcurrent = maxConcurrent;
    this.running = 0;
    this.queue = [];
    this.taskMap = new Map();
  }

  /**
   * 添加任务到队列
   */
  enqueue(task: Function) {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2); // 生成唯一ID
    const controller = new AbortController();

    // 包装任务：注入取消信号
    const wrappedTask = async () => {
      try {
        this.taskMap.set(id, { status: "running", controller });
        return await task(controller.signal); // 传递signal给任务
      } finally {
        this.running--;
        this.taskMap.delete(id);
        this._dequeue();
      }
    };

    // 存入队列
    const promise = new Promise((resolve, reject) => {
      this.queue.push({ id, fn: wrappedTask, resolve, reject, controller });
      this._dequeue();
    });

    this.taskMap.set(id, { status: "pending", controller });
    return { id, promise };
  }

  /**
   * 取消指定任务
   */
  public cancelTask(id: string) {
    const taskInfo = this.taskMap.get(id);
    if (!taskInfo) return;

    const { status, controller } = taskInfo;
    if (status === "pending") {
      // 从队列中移除未执行的任务
      this.queue = this.queue.filter((item) => item.id !== id);
      taskInfo.reject?.(new Error("Task canceled before execution"));
    } else if (status === "running") {
      controller.abort(); // 中断正在执行的任务
    }
    this.taskMap.delete(id);
  }

  /**
   * 执行队列中的任务，达到并发上限或队列为空时停止
   */
  _dequeue() {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }
    const task = this.queue.shift()!;
    this.running++;
    task.fn();
  }
}
