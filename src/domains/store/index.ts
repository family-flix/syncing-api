import { Result, Unpacked } from "@/types";
import { bytes_to_size } from "@/utils";
import { PrismaClient } from "@prisma/client";

import { DataStore, ModelKeys, Statistics } from "./types";
import { add_factory, delete_factory, update_factory, first_factory, many_factory, pagination_factory } from "./utils";

export class DatabaseStore implements DataStore {
  prisma: PrismaClient;
  table_names: ModelKeys[] = [];
  constructor(client: PrismaClient) {
    this.prisma = client;
  }
  clear_dataset = (name: ModelKeys) => {
    // @ts-ignore
    return this.prisma[name].deleteMany({});
  };
  build_extra_args(body: { next_marker?: string; page_size?: number }) {
    const { next_marker, page_size = 20 } = body;
    const extra_args = {
      take: page_size + 1,
      ...(() => {
        const cursor: { id?: string } = {};
        if (next_marker) {
          cursor.id = next_marker;
          return {
            cursor,
          };
        }
        return {};
      })(),
    };
    return extra_args;
  }
  get_next_marker<T extends { id: string }>(list: T[], body: { page_size: number }) {
    const { page_size = 20 } = body;
    let new_next_marker = null;
    if (list.length === page_size + 1) {
      const last_record = list[list.length - 1];
      new_next_marker = last_record.id;
    }
    return new_next_marker;
  }
  async list_with_cursor<F extends (extra: { take: number }) => any>(options: {
    fetch: F;
    next_marker: string;
    page_size?: number;
  }) {
    const { fetch, next_marker = "", page_size = 20 } = options;
    if (next_marker === null) {
      return {
        next_marker: null,
        list: [] as Unpacked<ReturnType<F>>[number][],
      };
    }
    const extra_args = this.build_extra_args({ next_marker, page_size });
    const list = await fetch(extra_args);
    const correct_list: Unpacked<ReturnType<F>>[number][] = list.slice(0, page_size);
    return {
      next_marker: this.get_next_marker(list, { page_size }),
      list: correct_list,
    };
  }
  async list_with_pagination<F extends (extra: { take: number; skip: number }) => any>(options: {
    fetch: F;
    next_marker?: string;
    page?: number;
    page_size?: number;
  }) {
    const { fetch, page = 1, page_size = 20 } = options;
    const extra_args = {
      skip: (page - 1) * page_size,
      take: page_size,
    };
    const list = await fetch(extra_args);
    return {
      list,
      // no_more: list.length + (page - 1) * page_size >= count,
    };
  }
}
