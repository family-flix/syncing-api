/**
 * @file 本地文件上传至阿里云盘
 * 打包成 js 放在 nas 上用
 * yarn esbuild domains/media_upload/index.ts --platform=node --target=node12 --define:DEBUG=true --bundle --outfile=dist/client.js
 */
import fs from "fs";
import path from "path";

import { BaseDomain, Handler } from "@/domains/base";
import { AliyunDriveClient } from "@/domains/clients/alipan/index";
import { file_info } from "@/domains/clients/alipan/utils";
import { DataStore } from "@/domains/store/types";
import { DriveClient } from "@/domains/clients/types";
import { Article, ArticleLineNode } from "@/domains/article/index";
import { DriveTypes } from "@/domains/drive/constants";
import { parse_argv } from "@/utils/server";
import { Result } from "@/types/index";
import { r_id } from "@/utils/index";

enum Events {
  Change,
  Print,
}
type TheTypesOfEvents = {
  [Events.Change]: void;
  [Events.Print]: ArticleLineNode;
};
type MediaUploadProps = {
  // drive_id: number | string;
  drive: {
    id: string;
    unique_id: string;
    root_folder_id: null | string;
  };
  store: DataStore;
  client: DriveClient;
};

export class MediaUpload extends BaseDomain<TheTypesOfEvents> {
  /** 获取云盘 */
  static async Get(payload: { drive_id: number | string; store: DataStore }) {
    const { drive_id, store } = payload;
    const existing = await store.prisma.drive.findFirst({
      where: { unique_id: String(drive_id) },
      include: {
        drive_token: true,
      },
    });
    if (!existing) {
      return Result.Err("没有匹配的记录");
    }
    const { id, type, root_folder_id } = existing;
    if (type !== null && ![DriveTypes.AliyunBackupDrive, DriveTypes.AliyunResourceDrive].includes(type)) {
      return Result.Err(`暂不支持 '${type}' 类型的云盘`);
    }
    const r = await AliyunDriveClient.Get({
      unique_id: String(drive_id),
      store,
    });
    if (r.error) {
      return Result.Err(`获取 drive 失败，因为 ${r.error.message}`);
    }
    const client = r.data;
    client.debug = true;
    const r2 = await client.ensure_initialized();
    if (r2.error) {
      return Result.Err(`initialize drive failed, because ${r2.error.message}`);
    }
    const u = new MediaUpload({
      drive: {
        id,
        unique_id: String(drive_id),
        root_folder_id,
      },
      client,
      store,
    });
    return Result.Ok(u);
  }
  static ParseArgv(args: string[]) {
    return parse_argv(args);
  }

  drive: {
    id: string;
    unique_id: string;
    root_folder_id: null | string;
  };

  store: DataStore;
  client: DriveClient;

  constructor(props: Partial<{ _name: string }> & MediaUploadProps) {
    super(props);

    const { drive, store, client } = props;

    this.drive = drive;
    this.store = store;
    this.client = client;
  }

  async upload_file(body: {
    /** 文件路径 */
    filepath: string;
    /** 上传后的文件名 */
    filename: string;
    /** 上传到哪个父文件夹 */
    parent_file_id: string;
  }) {
    const { parent_file_id, filename, filepath } = body;
    // console.log("1. check file existing before upload", parent_file_id, filename);
    const file_existing_r = await this.client.existing(parent_file_id, filename);
    // console.log("2. check file existing before upload", file_existing_r.error);
    if (file_existing_r.error) {
      return Result.Err(`check existing failed, because ${file_existing_r.error.message}`);
    }
    const file_existing = file_existing_r.data;
    if (file_existing) {
      return Result.Err(`the file existing`);
    }
    const result = await this.client.upload(filepath, {
      name: filename,
      parent_file_id,
      on_progress(v) {
        console.log(v);
      },
    });
    if (result.error) {
      return Result.Err(`upload failed, because ${result.error.message}`);
    }
    return Result.Ok(result.data);
  }
  async upload(filepath: string, options: { parent_file_id: string }) {
    const root_file_id = options.parent_file_id;
    const filename = path.basename(filepath);
    const type_r = await file_info(filepath);
    if (type_r.error) {
      this.emit(Events.Print, Article.build_line([type_r.error.message]));
      return Result.Err(`check filepath type failed, because ${type_r.error.message}`);
    }
    const type = type_r.data.file_type;
    if (type === "file") {
      this.emit(Events.Print, Article.build_line([`就1个、${filename}`]));
      const r = await this.upload_file({
        filename,
        filepath: filepath,
        parent_file_id: root_file_id,
      });
      if (r.error) {
        this.emit(Events.Print, Article.build_line(["上传失败", r.error.message]));
        return Result.Ok([
          {
            filepath,
            error: r.error.message,
          },
        ]);
      }
      const { file_id, file_name } = r.data;
      this.emit(Events.Print, Article.build_line(["上传成功"]));
      return Result.Ok([
        {
          file_id,
          file_name,
          filepath,
          error: null,
        },
      ]);
    }
    const folder = {
      name: filename,
    };
    const dir = filepath;
    const files = fs.readdirSync(dir);
    const folder_existing_r = await this.client.existing(root_file_id, folder.name);
    if (folder_existing_r.error) {
      this.emit(Events.Print, Article.build_line(["check existing failed, because ", folder_existing_r.error.message]));
      return Result.Err(["check existing failed, because ", folder_existing_r.error.message].join(""));
    }
    let folder_existing = folder_existing_r.data
      ? {
          file_id: folder_existing_r.data.file_id,
        }
      : null;
    if (!folder_existing) {
      const r2 = await this.client.create_folder({ parent_file_id: root_file_id, name: folder.name });
      if (r2.error) {
        this.emit(Events.Print, Article.build_line([folder.name, " create folder failed, because ", r2.error.message]));
        return Result.Err(["create folder failed, because ", r2.error.message].join(""));
      }
      folder_existing = r2.data;
    }
    if (!folder_existing) {
      this.emit(Events.Print, Article.build_line(["there is no parent folder that can save media files"]));
      return Result.Err("there is no parent folder that can save media files");
    }
    const result: {
      file_id?: string;
      file_name?: string;
      filepath: string;
      error: string | null;
    }[] = [];
    this.emit(Events.Print, Article.build_line([`共${files.length}个文件`]));
    for (let i = 0; i < files.length; i += 1) {
      await (async () => {
        const filename = files[i];
        const file_path = path.resolve(dir, filename);
        this.emit(Events.Print, Article.build_line([`第${i + 1}个、${filename}`]));
        const r = await this.upload_file({
          parent_file_id: folder_existing.file_id,
          filename,
          filepath: file_path,
        });
        this.emit(
          Events.Print,
          Article.build_line([`第${i + 1}个、${filename} 上传完成。${r.error ? r.error.message : ""}`])
        );
        if (r.error) {
          result.push({
            filepath: file_path,
            error: r.error.message,
          });
          return;
        }
        const { file_id, file_name } = r.data;
        result.push({
          file_id,
          file_name,
          filepath,
          error: null,
        });
      })();
    }
    return Result.Ok(result);
  }

  on_print(handler: Handler<TheTypesOfEvents[Events.Print]>) {
    return this.on(Events.Print, handler);
  }
}
