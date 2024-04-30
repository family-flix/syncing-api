import { user, task, file, drive, drive_token, PrismaClient } from "@prisma/client";

import { Result, Unpacked } from "@/types/index";

export type AsyncTaskRecord = task;
export type RecordCommonPart = {
  id: string;
};
export type UserRecord = user;
export type FileRecord = file;
export type DriveRecord = drive;
export type DriveTokenRecord = drive_token;

export type Statistics = {
  drive_count: number;
  drive_total_size_count: number;
  drive_used_size_count: number;
  movie_count: number;
  season_count: number;
  episode_count: number;
  sync_task_count: number;
  /** 今日新增文件 */
  new_file_count_today: number;
  /** 总提交问题数 */
  report_count: number;
  /** 想看 数 */
  media_request_count: number;
  invalid_season_count: number;
  invalid_movie_count: number;
  invalid_sync_task_count: number;
  unknown_media_count: number;
  file_size_count_today: number;
  updated_at: string | null;
};

export type ModelKeys = keyof Omit<
  PrismaClient,
  | "$on"
  | "$connect"
  | "$disconnect"
  | "$use"
  | "$executeRaw"
  | "$executeRawUnsafe"
  | "$queryRaw"
  | "$queryRawUnsafe"
  | "$transaction"
>;

export type ModelParam<F extends (...args: any[]) => any> = NonNullable<Parameters<F>[number]>;
export type ModelQuery<T extends ModelKeys> = NonNullable<Parameters<PrismaClient[T]["findMany"]>[0]>["where"];
export type ModelUpdateInput<T extends ModelKeys> = NonNullable<Parameters<PrismaClient[T]["update"]>[0]>["data"];

export interface DataStore {
  prisma: PrismaClient;
  // prisma: {
  //   user: {
  //     findFirst: PrismaClient["user"]["findFirst"];
  //   };
  //   settings: {
  //     update: PrismaClient["settings"]["update"];
  //   };
  //   file: {
  //     deleteMany: PrismaClient["file"]["deleteMany"];
  //   };
  //   tmp_file: {
  //     create: PrismaClient["tmp_file"]["create"];
  //     findFirst: PrismaClient["tmp_file"]["findFirst"];
  //     deleteMany: PrismaClient["tmp_file"]["deleteMany"];
  //   };
  //   resource_sync_task: {
  //     update: PrismaClient["resource_sync_task"]["update"];
  //   };
  // };
  list_with_cursor<F extends (extra: { take: number }) => any>(options: {
    fetch: F;
    next_marker: string;
    page_size?: number;
  }): Promise<{
    next_marker: string | null;
    list: Unpacked<ReturnType<F>>[number][];
  }>;
}
