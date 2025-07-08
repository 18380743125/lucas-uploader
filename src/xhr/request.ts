export interface RequestConfig {
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean>;
  data?: any;
  timeout?: number;
}

export interface CancelToken {
  promise: Promise<any>;
}

export interface CancelTokenSource {
  token: CancelToken;

  cancel(message?: string): void;
}

export function createCancelTokenSource(): CancelTokenSource {
  let cancelFn: (message?: string) => void;
  let canceled = false;

  const promise = new Promise(resolve => {
    cancelFn = (message?: string) => {
      canceled = true;
      resolve(message);
    };
  });

  return {
    token: {
      promise
    },
    cancel(message?: string) {
      if (!canceled) {
        cancelFn(message);
      }
    }
  };
}

export function request(
  config: RequestConfig,
  onUploadProgress?: (progressEvent: ProgressEvent) => void,
  onXHRCreated?: (xhr: XMLHttpRequest) => void
) {
  return new Promise((resolve, reject) => {
    const {url, method = 'GET', headers = {}, params, data, timeout = 5 * 60 * 1000} = config;

    let requestUrl = url;
    if (method.toUpperCase() === 'GET' && params) {
      const queryString = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        queryString.append(key, String(value));
      });
      requestUrl += `?${queryString.toString()}`;
    }

    const xhr = new XMLHttpRequest();

    if (onXHRCreated) {
      onXHRCreated(xhr);
    }

    let isCompleted = false;

    xhr.timeout = timeout;

    if (onUploadProgress && method.toUpperCase() !== 'GET' && data instanceof FormData) {
      xhr.upload.addEventListener('progress', onUploadProgress);
    }

    xhr.onload = () => {
      if (isCompleted) return;
      isCompleted = true;

      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const responseData = JSON.parse(xhr.responseText);
          resolve(responseData);
        } catch (error) {
          reject(new Error('Failed to parse response JSON'));
        }
      } else {
        reject(new Error(`HTTP error: ${xhr.status} ${xhr.statusText}`));
      }
    };

    xhr.onerror = () => {
      if (isCompleted) return;
      isCompleted = true;
      reject(new Error('Network error'));
    };

    xhr.ontimeout = () => {
      if (isCompleted) return;
      isCompleted = true;
      reject(new Error('Request timeout'));
    };

    xhr.open(method, requestUrl);

    Object.entries(headers).forEach(([key, value]) => {
      xhr.setRequestHeader(key, value);
    });

    if (data && method.toUpperCase() !== 'GET') {
      if (data instanceof FormData) {
        xhr.send(data);
      } else {
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.send(JSON.stringify(data));
      }
    } else {
      xhr.send();
    }
  });
}

export function requestWithCancel(config: RequestConfig, onUploadProgress?: (progressEvent: ProgressEvent) => void) {
  const source = createCancelTokenSource();
  let xhr: XMLHttpRequest | null = null;

  const requestPromise = new Promise((resolve, reject) => {
    request(config, onUploadProgress, createdXhr => (xhr = createdXhr))
      .then(resolve)
      .catch(reject);

    source.token.promise.then((message?: string) => {
      if (xhr) {
        xhr.abort();
      }
      reject(new Error(`Request canceled: ${message || null}`));
    });
  });

  return {
    requestPromise,
    cancel: (message?: string) => {
      source.cancel(message);
    }
  };
}
