/**
 * 请求配置
 */
export interface RequestConfig {
  url: string;
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean>;
  data?: any;
  timeout?: number;
}

/**
 * 取消令牌
 */
export interface CancelToken {
  promise: Promise<any>;
  reason?: undefined;
  throwIfRequested(): void;
}

/**
 * 取消令牌源（用于生成和管理取消令牌）
 */
export interface CancelTokenSource {
  token: CancelToken;
  cancel(message?: string): void;
}

/**
 * 创建取消令牌源
 */
export function createCancelTokenSource(): CancelTokenSource {
  let cancelFn: (message?: string) => void;
  let canceled = false;

  const promise = new Promise((resolve) => {
    cancelFn = () => {
      canceled = true;
      resolve(undefined);
    };
  });

  const token: CancelToken = {
    promise,
    throwIfRequested() {
      if (canceled) {
        throw new Error("Request canceled");
      }
    },
  };

  return {
    token,
    cancel(message?: string) {
      if (!canceled) {
        cancelFn(message); // 调用 cancelFn（会设置 canceled = true）
      }
    },
  };
}

/**
 * 使用 XMLHttpRequest 封装请求（支持文件上传 + 进度监控 + 取消请求）
 */
export function xhrRequest(
  config: RequestConfig,
  onUploadProgress?: (progressEvent: ProgressEvent) => void
): Promise<any> {
  return new Promise((resolve, reject) => {
    const {
      url,
      method = "GET",
      headers = {},
      params,
      data,
      timeout = 5 * 60 * 1000,
    } = config;

    // 1. 处理 URL 查询参数（GET 请求）
    let requestUrl = url;
    if (method.toUpperCase() === "GET" && params) {
      const queryString = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        queryString.append(key, String(value));
      });
      requestUrl += `?${queryString.toString()}`;
    }

    // 2. 创建 XMLHttpRequest
    const xhr = new XMLHttpRequest();

    // 3. 设置超时
    xhr.timeout = timeout;

    // 4. 处理上传进度（仅 FormData 文件上传）
    if (
      onUploadProgress &&
      method.toUpperCase() !== "GET" &&
      data instanceof FormData
    ) {
      xhr.upload.addEventListener("progress", onUploadProgress);
    }

    // 5. 处理请求完成
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const responseData = JSON.parse(xhr.responseText);
          resolve(responseData);
        } catch (error) {
          reject(new Error("Failed to parse response JSON"));
        }
      } else {
        reject(new Error(`HTTP error: ${xhr.status} ${xhr.statusText}`));
      }
    };

    // 6. 处理错误（网络错误）
    xhr.onerror = () => {
      reject(new Error("Network error"));
    };

    // 7. 处理超时
    xhr.ontimeout = () => {
      reject(new Error("Request timeout"));
    };

    // 8. 打开连接
    xhr.open(method, requestUrl);

    // 9. 设置请求头
    Object.entries(headers).forEach(([key, value]) => {
      xhr.setRequestHeader(key, value);
    });

    // 10. 发送请求
    if (data && method.toUpperCase() !== "GET") {
      if (data instanceof FormData) {
        // 文件上传（不要手动设置 Content-Type，浏览器会自动添加 boundary）
        xhr.send(data);
      } else {
        // JSON 数据
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.send(JSON.stringify(data));
      }
    } else {
      // GET 请求（无请求体）
      xhr.send();
    }
  });
}

/**
 * 封装支持取消请求的 XHR 请求
 */
export function xhrRequestWithCancel<T = any>(
  config: RequestConfig,
  onUploadProgress?: (progressEvent: ProgressEvent) => void
): { request: Promise<any>; cancel: (message?: string) => void } {
  const source = createCancelTokenSource();

  const requestPromise = new Promise((resolve, reject) => {
    // 监听取消事件
    source.token.promise.then(() => {
      // 如果请求已取消，直接 reject
      reject(new Error("Request canceled"));
    });

    // 发起请求
    xhrRequest(config, onUploadProgress)
      .then(resolve)
      .catch((error) => {
        if (error.message === "Request canceled") {
          reject(error);
        } else {
          reject(error);
        }
      });
  });

  // 返回请求 Promise 和取消方法
  return {
    request: requestPromise,
    cancel: (message?: string) => {
      source.cancel(message);
    },
  };
}
