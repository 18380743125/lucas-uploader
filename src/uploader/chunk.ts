export class Chunk {
  public chunkNumber: number;

  public chunkSize: number;

  public currentChunkSize: number;

  public identifier: string;

  public filename: string;

  public totalChunks: number;

  public file: Blob;

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
  }
}
