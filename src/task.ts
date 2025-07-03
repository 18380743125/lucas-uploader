export interface IUploadTask {
  id: string
}

export class UploadTask {
  public id: string;

  constructor(id: string) {
    this.id = id;
  }
}
