/**
 * 分片对象
 */
export class Chunk {
  // 当前分片号
  public chunkNumber: number;

  // 分片大小
  public chunkSize: number;

  // 当前分片大小
  public currentChunkSize: number;

  // 文件唯一标识
  public identifier: string;

  // 文件名称
  public filename: string;

  // 总分片数
  public totalChunks: number;

  // 分片文件
  public file: Blob;

  // 分片上传状态
  public status: 'pending' | 'success' | 'fail';

  constructor(
    chunkNumber: number,
    chunkSize: number,
    currentChunkSize: number,
    identifier: string,
    filename: string,
    totalChunks: number,
    file: Blob
  ) {
    this.chunkNumber = chunkNumber;
    this.chunkSize = chunkSize;
    this.currentChunkSize = currentChunkSize;
    this.identifier = identifier;
    this.filename = filename;
    this.totalChunks = totalChunks;
    this.file = file;
    this.status = 'pending';
  }
}
