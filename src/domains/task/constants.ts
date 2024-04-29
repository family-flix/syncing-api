export enum TaskStatus {
  Running = 1,
  Paused,
  Finished,
}
export enum TaskTypes {
  /** 下载资源至本地 */
  Download = 1,
  /** 上传本地资源至云盘 */
  UploadToCloudDrive = 2,
  /** 其他（不好归属的都到这里 */
  Other,
}
