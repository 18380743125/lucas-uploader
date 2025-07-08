import sparkMD5 from 'spark-md5';

/**
 * 计算文件的 MD5 哈希值
 * @param _file
 * @param chunkSize
 * @param onProgress
 */
export function MD5(
  _file: File,
  chunkSize: number = 512 * 1024,
  onProgress?: (progress: { currentChunk: number; chunks: number }) => void
) {
  return new Promise<string>((resolve, reject) => {
    const blobSlice = Blob.prototype.slice;
    const file = _file;
    const chunks = Math.ceil(file.size / chunkSize);
    const spark = new sparkMD5.ArrayBuffer();
    const fileReader = new FileReader();
    let currentChunk = 0;

    fileReader.onload = function (e: any) {
      spark.append(e.target.result);
      currentChunk++;
      if (onProgress) {
        onProgress({ currentChunk, chunks });
      }
      if (currentChunk < chunks) {
        loadNext();
      } else {
        resolve(spark.end());
      }
    };

    fileReader.onerror = function () {
      reject(new Error(`FileReader error: ${fileReader.error?.message || null}`));
    };

    function loadNext() {
      const start = currentChunk * chunkSize;
      const end = start + chunkSize >= file.size ? file.size : start + chunkSize;
      fileReader.readAsArrayBuffer(blobSlice.call(file, start, end));
    }

    loadNext();
  });
}
