import fs from "fs";
import path from "path";

import { throttle } from "lodash";
import dayjs from "dayjs";

import { BaseDomain, Handler } from "@/domains/base";
import { Article, ArticleLineNode, ArticleTextNode } from "@/domains/article/index";
import { Application } from "@/domains/application/index";
import { UserUniqueID } from "@/domains/user/index";
import { AsyncTaskRecord, DataStore } from "@/domains/store/types";
import { Result } from "@/types/index";
import { r_id } from "@/utils/index";

import { TaskStatus, TaskTypes } from "./constants";

export * from "./constants";

enum Events {
  StopTask,
}
type TheTypesOfEvents = {
  [Events.StopTask]: void;
};
type JobNewProps = {
  unique_id: string;
  type: TaskTypes;
  desc: string;
  user_id: UserUniqueID;
  store: DataStore;
  app: Application<any>;
  on_print?: () => void;
};
type TaskProps = {
  id: number;
  profile: Pick<
    AsyncTaskRecord,
    "unique_id" | "type" | "status" | "desc" | "log_filepath" | "error" | "created" | "updated" | "user_id"
  >;
  output: Article;
  app: Application<any>;
  store: DataStore;
};
const cached_jobs: Record<string, Task> = {};

export class Task extends BaseDomain<TheTypesOfEvents> {
  static async Get(body: { id: number; user_id: UserUniqueID; app: Application<any>; store: DataStore }) {
    const { id, user_id, app, store } = body;
    if (cached_jobs[id]) {
      return Result.Ok(cached_jobs[id]);
    }
    const r1 = await store.prisma.task.findFirst({
      where: {
        id,
        user_id,
      },
    });
    if (!r1) {
      return Result.Err("没有匹配的任务记录");
    }
    const { desc, unique_id, type, log_filepath, status, error, created, updated } = r1;
    const job = new Task({
      id,
      profile: {
        status,
        desc,
        unique_id,
        type,
        log_filepath,
        error,
        created,
        updated,
        user_id,
      },
      output: new Article({}),
      app,
      store,
    });
    cached_jobs[id] = job;
    return Result.Ok(job);
  }

  static async New(body: JobNewProps) {
    const { desc, type, unique_id, user_id, app, store } = body;
    const existing = await store.prisma.task.findFirst({
      where: {
        type,
        unique_id,
        status: TaskStatus.Running,
        user_id,
      },
    });
    if (existing) {
      return Result.Err("有运行中的任务", "40001", { job_id: existing.id });
    }
    const output_unique_id = r_id();
    const res = await store.prisma.task.create({
      data: {
        unique_id,
        type,
        desc,
        status: TaskStatus.Running,
        log_filepath: `${dayjs().format("YYYYMMDD")}-${output_unique_id}.txt`,
        user: {
          connect: {
            id: user_id,
          },
        },
      },
    });
    const { id, status, type: t, log_filepath, created, updated } = res;
    const output = new Article({});
    const job = new Task({
      id,
      profile: {
        unique_id,
        type: t,
        desc,
        status,
        log_filepath,
        error: null,
        created,
        updated,
        user_id,
      },
      output,
      app,
      store,
    });
    cached_jobs[id] = job;
    return Result.Ok(job);
  }

  id: number;
  profile: TaskProps["profile"];
  percent = 0;
  prev_write_time: number;
  timer: null | NodeJS.Timer = null;

  output: Article;
  store: DataStore;
  app: Application<any>;

  constructor(props: TaskProps) {
    super();

    const { id, profile, output, app, store } = props;
    this.id = id;
    this.output = output;
    this.profile = profile;
    this.store = store;
    this.app = app;
    this.prev_write_time = dayjs().valueOf();
    this.output.on_write(this.update_content);
  }
  pending_lines = [];
  update_content_force = async () => {
    this.prev_write_time = dayjs().valueOf();
    const content = this.output.to_json();
    this.output.clear();
    if (content.length === 0) {
      return;
    }
    if (!this.profile.log_filepath) {
      return;
    }
    const log_filepath = path.resolve(this.app.root_path, "logs", this.profile.log_filepath);
    fs.appendFileSync(
      log_filepath,
      [
        "",
        ...content.map((c) => {
          return JSON.stringify(c);
        }),
      ].join("\n")
    );
  };
  update_content = throttle(this.update_content_force, 5000);
  update_percent = throttle(async (percent: number) => {
    console.log("[DOMAIN]job/index - update_percent", `${(percent * 100).toFixed(2)}%`);
    await this.store.prisma.task.update({
      where: {
        id: this.id,
      },
      data: {
        percent,
        updated: dayjs().toISOString(),
      },
    });
  }, 5000);
  check_need_pause = throttle(async () => {
    const r = await this.store.prisma.task.findFirst({
      where: {
        id: this.id,
      },
    });
    if (!r) {
      return Result.Ok(false);
    }
    const { need_stop } = r;
    if (need_stop) {
      return Result.Ok(true);
    }
    return Result.Ok(false);
  }, 3000);
  async fetch_profile(with_log: boolean = true) {
    const r1 = await this.store.prisma.task.findFirst({
      where: {
        id: this.id,
        user_id: this.profile.user_id,
      },
    });
    if (!r1) {
      return Result.Err("没有匹配的任务记录");
    }
    const { id, desc, status, percent, log_filepath: filepath, error, created, updated } = r1;
    if (!filepath) {
      return Result.Ok({
        id,
        status,
        desc,
        lines: [],
        percent,
        more_line: false,
        error,
        created,
        updated,
      });
    }
    if (!with_log) {
      return Result.Ok({
        id,
        status,
        desc,
        // unique_id,
        lines: [],
        percent,
        more_line: false,
        error,
        created,
        updated,
      });
    }
    let content = "";
    try {
      const p = path.resolve(this.app.root_path, "logs", filepath);
      content = fs.readFileSync(p, "utf-8");
    } catch (err) {
      // ...
    }
    return Result.Ok({
      id,
      status,
      desc,
      lines: content.split("\n").filter(Boolean),
      percent,
      more_line: false,
      error,
      created,
      updated,
    });
  }
  /**
   * 主动终止任务
   */
  async pause(options: { force?: boolean } = {}) {
    const { force = false } = options;
    const r = await this.store.prisma.task.findFirst({
      where: {
        id: this.id,
      },
    });
    if (!r) {
      return Result.Err("记录不存在");
    }
    if (r.status !== TaskStatus.Running) {
      return Result.Err("该任务非运行中状态");
    }
    await this.store.prisma.task.update({
      where: {
        id: this.id,
      },
      data: {
        need_stop: 1,
        status: force ? TaskStatus.Paused : undefined,
      },
    });
    setTimeout(async () => {
      const r = await this.store.prisma.task.update({
        where: {
          id: this.id,
        },
        data: {
          status: TaskStatus.Finished,
        },
      });
    }, 3 * 1000);
    this.emit(Events.StopTask);
    if (this.profile.log_filepath) {
      const log_filepath = path.resolve(this.app.root_path, "logs", this.profile.log_filepath);
      fs.appendFileSync(
        log_filepath,
        [
          "",
          [
            new ArticleLineNode({
              children: [
                new ArticleTextNode({
                  text: "主动中止索引任务",
                }),
              ],
            }).to_json(),
          ].map((c) => {
            return JSON.stringify(c);
          }),
        ].join("\n")
      );
    }
    return Result.Ok(null);
  }
  /** mark the task is finished */
  async finish() {
    await this.update_content_force();
    await this.store.prisma.task.update({
      where: {
        id: this.id,
      },
      data: {
        need_stop: 0,
        status: TaskStatus.Finished,
      },
    });
    // const output = await this.store.prisma.output.findUnique({
    //   where: {
    //     id: this.profile.output_id,
    //   },
    // });
    // if (output === null) {
    //   return Result.Ok(null);
    // }
    return Result.Ok(null);
  }
  /** 标志任务失败，并记录失败原因 */
  async throw(error: Error) {
    this.output.write(
      new ArticleLineNode({
        children: [
          new ArticleTextNode({
            text: error.message,
          }),
        ],
      })
    );
    this.update_content_force();
    await this.store.prisma.task.update({
      where: {
        id: this.id,
      },
      data: {
        updated: dayjs().toISOString(),
        status: TaskStatus.Finished,
        error: error.message,
      },
    });
    return Result.Ok(null);
  }
  update(body: Partial<{ percent: number; desc: string }>) {
    this.store.prisma.task.update({
      where: {
        id: this.id,
      },
      data: body,
    });
  }
  is_to_long() {
    const { status, created } = this.profile;
    if (status === TaskStatus.Running && dayjs(created).add(50, "minute").isBefore(dayjs())) {
      // this.pause({ force: true });
      // return Result.Ok("任务耗时过长，自动中止");
      return true;
    }
    return false;
  }
  is_expected_break() {
    const { status, updated } = this.profile;
    if (status === TaskStatus.Running && dayjs(updated).add(30, "seconds").isBefore(dayjs())) {
      return true;
    }
    return false;
  }

  on_pause(handler: Handler<TheTypesOfEvents[Events.StopTask]>) {
    const handler1 = async () => {
      // console.log("[DOMAIN]job/index - check need stop");
      const r = await this.store.prisma.task.findFirst({
        where: {
          id: this.id,
        },
      });
      if (!r) {
        return Result.Err("记录不存在");
      }
      // console.log("[DOMAIN]job/index - before TaskStatus.Paused", r.status);
      if (r.need_stop) {
        this.emit(Events.StopTask);
        this.app.clearInterval(handler1);
      }
      if ([TaskStatus.Paused, TaskStatus.Finished].includes(r.status)) {
        this.app.clearInterval(handler1);
      }
      return Result.Ok(null);
    };
    this.app.startInterval(handler1, 5000);
    return this.on(Events.StopTask, handler);
  }
}
