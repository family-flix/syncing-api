import fs from "fs";
import path from "path";

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { config } from "dotenv";

import { Application } from "@/domains/application/index";
import { APIStore } from "@/domains/store/api";
import { MediaUpload } from "@/domains/media_upload/index";
import { User } from "@/domains/user/index";
import { AuthenticationProviders } from "@/domains/user/constants";
import { DataStore } from "@/domains/store/types";
import { FileManage } from "@/domains/uploader/index";
import { MTeamPTClient } from "@/domains/pt/mteam/index";
import { Task, TaskStatus, TaskTypes } from "@/domains/task/index";
import { HttpClientCore } from "@/domains/http_client/index";
import { connect } from "@/domains/http_client/provider.axios";
import { FileType } from "@/constants/index";
import { file_info } from "@/utils/fs";
import { loop_request } from "@/utils/index";
import { Result, Unpacked } from "@/types/index";
import { LocalFileDriveClient } from "./domains/clients/local";
import { parse_argv } from "./utils/server";
import { ApplicationState } from "./store/types";

config();
const ROOT_DIR = process.env.ROOT_DIR;
async function main() {
  if (!ROOT_DIR) {
    console.log("缺少环境变量 ROOT_DIR");
    return;
  }
  const application = new Application<ApplicationState>({
    root_path: ROOT_DIR,
    // @ts-ignore
    env: process.env,
    args: parse_argv<{ port: number }>(process.argv.slice(2)),
  });
  const server = new Hono<{ Bindings: { store: typeof application.store; user: User }; Variables: {} }>();

  server.use(async (c, next) => {
    console.log(`[${c.req.method}] ${c.req.url}`);
    await next();
  });
  server.use("/static/*", serveStatic({ root: path.resolve(__dirname, "./dist") }));
  server.use(async (c, next) => {
    c.env.store = application.store;
    await next();
  });
  // server.use(async (c, next) => {
  //   const { authorization } = await c.req.header();
  //   console.log(authorization);
  //   const r = await User.New(authorization, c.env.store);
  //   if (r.error) {
  //     return c.json({
  //       code: 900,
  //       msg: r.error.message,
  //       data: null,
  //     });
  //   }
  //   c.env.user = r.data;
  //   await next();
  // });

  server.get("/api/ping", async (c) => {
    return c.json({
      code: 0,
      msg: "success",
      data: null,
    });
  });
  server.post("/api/user/validate", async (c) => {
    const { authorization } = await c.req.header();
    const existing = await c.env.store.prisma.user.findFirst({});
    if (!existing) {
      return c.json({
        code: 901,
        msg: "请先注册",
        data: null,
      });
    }
    const r = await User.New(authorization, c.env.store);
    if (r.error) {
      return c.json({
        code: 900,
        msg: r.error.message,
        data: null,
      });
    }
    const user = r.data;
    return c.json({
      code: 0,
      msg: "",
      data: { ok: 1 },
    });
  });
  server.post("/api/user/register", async (c) => {
    const { email, password: pwd } = await c.req.json();
    const r = await User.Create({
      provider: AuthenticationProviders.Credential,
      provider_id: email,
      provider_arg1: pwd,
      store: c.env.store,
    });
    if (r.error) {
      return c.json({
        code: 101,
        msg: r.error.message,
        data: null,
      });
    }
    return c.json({
      code: 0,
      msg: "success",
      data: {
        nickname: r.data.nickname,
        token: r.data.token,
      },
    });
  });
  server.post("/api/user/update_settings", async (c) => {
    const { authorization } = await c.req.header();
    const r = await User.New(authorization, c.env.store);
    if (r.error) {
      return c.json({
        code: 900,
        msg: r.error.message,
        data: null,
      });
    }
    const user = r.data;
    const { site, paths } = await c.req.json();
    if (!site) {
      return c.json({
        code: 101,
        msg: "缺少 site 参数",
        data: null,
      });
    }
    if (!paths) {
      return c.json({
        code: 101,
        msg: "缺少 paths 参数",
        data: null,
      });
    }
    const r2 = await user.update_settings({ site, paths });
    if (r2.error) {
      return c.json({
        code: 102,
        msg: r2.error.message,
        data: null,
      });
    }
    return c.json({
      code: 0,
      msg: "success",
      data: {
        nickname: r.data.nickname,
        token: r.data.token,
      },
    });
  });
  /** 获取登录用户详情 */
  server.post("/api/user/profile", async (c) => {
    const { authorization } = await c.req.header();
    const r = await User.New(authorization, c.env.store);
    if (r.error) {
      return c.json({
        code: 900,
        msg: r.error.message,
        data: null,
      });
    }
    const user = r.data;
    const r2 = await user.profile();
    if (r2.error) {
      return c.json({
        code: 101,
        msg: r2.error.message,
        data: null,
      });
    }
    return c.json({
      code: 0,
      msg: "success",
      data: r2.data,
    });
  });
  /** 文件下载完成，通知服务器上传文件至云盘 */
  server.post("/api/download/callback", async (c) => {
    const { authorization } = await c.req.header();
    const r = await User.New(authorization, c.env.store);
    if (r.error) {
      return c.json({
        code: 900,
        msg: r.error.message,
        data: null,
      });
    }
    const user = r.data;
    if (!user.settings) {
      return c.json({
        code: 102,
        msg: "缺少 settings，未完成初始化流程",
        data: null,
      });
    }
    const { site, paths } = user.settings;
    if (!site.token) {
      return c.json({
        code: 102,
        msg: "缺少 token，未完成初始化流程",
        data: null,
      });
    }
    const { f } = await c.req.json();
    if (!f) {
      return c.json({
        code: 101,
        msg: "请传入 f 参数",
        data: null,
      });
    }
    const filepath = (() => {
      if (path.isAbsolute(f)) {
        return f;
      }
      return path.resolve(paths.file, f);
    })();
    const file_r = await file_info(filepath);
    if (file_r.error) {
      // console.log(file_r.error.message);
      return c.json({
        code: 101,
        msg: file_r.error.message,
        data: null,
      });
    }
    const stat = file_r.data;
    // uploader.on_print((v) => {
    //   console.log(v);
    // });
    const r2 = await Task.New({
      unique_id: filepath,
      desc: `上传「${f}」至云盘`,
      type: TaskTypes.UploadToCloudDrive,
      user_id: user.id,
      app: application,
      store: c.env.store,
    });
    if (r2.error) {
      return c.json({
        code: 101,
        msg: r2.error.message,
        data: null,
      });
    }
    const task = r2.data;
    const _client = new HttpClientCore({
      hostname: site.hostname,
      headers: {
        Authorization: `${site.token}`,
      },
    });
    connect(_client);
    // @ts-ignore
    const site_client: HttpClientCore = {
      ..._client,
      async post<T>(...args: Parameters<typeof _client.post>) {
        const r = await _client.post<{ code: number; msg: string; data: T }>(...args);
        if (r.error) {
          return Result.Err(r.error.message);
        }
        const { code, msg, data } = r.data;
        if (code !== 0) {
          return Result.Err(msg, code);
        }
        return Result.Ok(data as T);
      },
      async get<T>(...args: Parameters<typeof _client.get>) {
        const r = await _client.get<{ code: number; msg: string; data: T }>(...args);
        if (r.error) {
          return Result.Err(r.error.message);
        }
        const { code, msg, data } = r.data;
        if (code !== 0) {
          return Result.Err(msg, code);
        }
        return Result.Ok(data as T);
      },
    };
    const api_store = new APIStore({
      client: site_client,
    });
    async function run(values: { drive_id: string; parent_file_id?: string; store: DataStore }) {
      const { drive_id, parent_file_id, store } = values;
      // const drive_id = TARGET_DRIVE_ID;
      const r1 = await MediaUpload.Get({
        drive_id,
        store,
      });
      if (r1.error) {
        task.throw(r1.error);
        return;
      }
      const uploader = r1.data;
      const drive = uploader.drive;
      const drive_client = uploader.client;
      const target_folder_id = (() => {
        if (parent_file_id) {
          return parent_file_id;
        }
        return drive.root_folder_id;
      })();
      if (!target_folder_id) {
        task.throw(new Error("云盘没有设置索引根目录"));
        return;
      }
      await uploader.upload(filepath, {
        parent_file_id: target_folder_id,
      });
      const file_in_drive_r = await drive_client.existing(target_folder_id, stat.name);
      if (file_in_drive_r.error) {
        task.throw(file_in_drive_r.error);
        return;
      }
      const file_in_drive = file_in_drive_r.data;
      if (file_in_drive === null) {
        task.throw(new Error(`上传完成后云盘中没有 ${stat.name}`));
        return;
      }
      const r = await site_client.post(`/api/v2/admin/analysis/files`, {
        drive_id: drive.id,
        files: [
          {
            file_id: file_in_drive.file_id,
            name: file_in_drive.name,
            type: stat.file_type === "file" ? FileType.File : FileType.Folder,
          },
        ],
      });
      if (r.error) {
        task.throw(r.error);
        return;
      }
      console.log("开始索引", r.data);
      await wait_task_finish({
        task_id: task.id,
        client: site_client,
        handler: (tmp) => {
          task.update_percent(tmp.percent);
        },
      });
      task.finish();
    }
    const TARGET_DRIVE_ID = "2549939630";
    run({
      drive_id: TARGET_DRIVE_ID,
      store: api_store,
    });
    return c.json({
      code: 0,
      msg: "开始上传",
      data: {
        task_id: task.id,
      },
    });
  });
  server.post("/api/task/list", async (c) => {
    const { authorization } = await c.req.header();
    const r = await User.New(authorization, c.env.store);
    if (r.error) {
      return c.json({
        code: 900,
        msg: r.error.message,
        data: null,
      });
    }
    const user = r.data;
    const { page, page_size, keyword } = await c.req.json();
    return c.json({
      code: 0,
      msg: "success",
      // tasks: tasks.map((t) => {
      //   const { uid, unique_id } = t;
      //   return {
      //     uid,
      //     unique_id,
      //   };
      // }),
    });
  });
  server.post("/api/file/list", async (c) => {
    const { authorization } = await c.req.header();
    const r = await User.New(authorization, c.env.store);
    if (r.error) {
      return c.json({
        code: 900,
        msg: r.error.message,
        data: null,
      });
    }
    const user = r.data;
    const { file_id, page_size, next_marker } = await c.req.json();
    const client = new LocalFileDriveClient({
      unique_id: "/",
    });
    const r2 = await client.fetch_files(file_id, {
      page_size,
      marker: next_marker,
    });
    if (r2.error) {
      return c.json({
        code: 101,
        msg: r2.error.message,
        data: null,
      });
    }
    return c.json({
      code: 0,
      msg: "",
      data: r2.data,
    });
  });
  server.post("/api/torrent/search", async (c) => {
    const { authorization } = await c.req.header();
    const r = await User.New(authorization, c.env.store);
    if (r.error) {
      return c.json({
        code: 900,
        msg: r.error.message,
        data: null,
      });
    }
    const user = r.data;
    const mteam = new MTeamPTClient();
    const { site, page, page_size, keyword } = await c.req.json();
    if (site === "mteam") {
      const r = await mteam.search({ page, page_size, keyword });
      if (r.error) {
        return c.json({
          code: 101,
          msg: r.error.message,
          data: null,
        });
      }
      return c.json({
        code: 0,
        msg: "success",
        data: r.data,
      });
    }
    return c.json({
      code: 101,
      msg: "未知的 type",
      data: null,
    });
  });
  server.post("/api/torrent/download", async (c) => {
    const { authorization } = await c.req.header();
    const r = await User.New(authorization, c.env.store);
    if (r.error) {
      return c.json({
        code: 900,
        msg: r.error.message,
        data: null,
      });
    }
    const user = r.data;
    if (!user.settings) {
      return c.json({
        code: 102,
        msg: "缺少 settings，未完成初始化流程",
        data: null,
      });
    }
    const { paths } = user.settings;
    const mteam = new MTeamPTClient();
    const manage = new FileManage({ root: ROOT_DIR });
    const { site, id } = await c.req.json();
    if (!id) {
      return c.json({
        code: 101,
        msg: "缺少 id 参数",
        data: null,
      });
    }
    if (!site) {
      return c.json({
        code: 101,
        msg: "缺少 site 参数",
        data: null,
      });
    }
    if (site === "mteam") {
      const r2 = await mteam.$profile.run(id);
      if (r2.error) {
        return c.json({
          code: 101,
          msg: r2.error.message,
          data: null,
        });
      }
      const r4 = await mteam.$download.run(id);
      if (r4.error) {
        return c.json({
          code: 101,
          msg: r4.error.message,
          data: null,
        });
      }
      const url = r4.data;
      const r5 = await manage.download(url, path.resolve(paths.torrent, r2.data.originFileName), {
        is_fullpath: true,
        skip_existing: true,
      });
      if (r5.error) {
        return c.json({
          code: 101,
          msg: r5.error.message,
          data: null,
        });
      }
      return c.json({
        code: 0,
        msg: "success",
        data: null,
      });
    }
    return c.json({
      code: 101,
      msg: "未知的 site",
      data: null,
    });
  });
  serve(
    {
      fetch: server.fetch,
      port: (() => {
        if (application.env.PORT) {
          return Number(application.env.PORT);
        }
        if (application.args.port) {
          return application.args.port;
        }
        return 3010;
      })(),
    },
    (info) => {
      const { address, port } = info;
      console.log(`Server is listening at ${address}:${port}`);
      console.log();
      console.log("Env");
      console.log("ROOT_DIR", ROOT_DIR);
    }
  );
}
main();

type TaskStatusResp = {
  status: number;
  desc: string;
  percent: number;
  error: string | null;
  created: string;
  updated: string;
};
export async function wait_task_finish(values: {
  task_id: number;
  client: HttpClientCore;
  handler: (r: TaskStatusResp) => void;
}) {
  const { task_id, client, handler } = values;
  const fn = loop_request({
    fetch(value: { task_id: string }) {
      return client.get<TaskStatusResp>(`/api/admin/job/status/${value.task_id}`);
    },
    async can_finish(r) {
      if (r.status === TaskStatus.Finished) {
        return true;
      }
      return false;
    },
    handler(r) {
      if (handler) {
        handler(r);
      }
    },
  });
  return fn({ task_id });
}
