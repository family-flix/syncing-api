import crypto from "crypto";
import fs, { ReadStream } from "fs";

import { FileType, MediaTypes } from "@/constants";
import { Result } from "@/types";
import { build_media_name, parse_filename_for_video } from "@/utils/parse_filename_for_video";

export function get_part_info_list(file_size: number, upload_chunk_size: number) {
  const num_parts = Math.ceil(file_size / upload_chunk_size);
  const part_info_list = [];
  for (let i = 1; i <= num_parts; i++) {
    part_info_list.push({ part_number: i });
  }
  return part_info_list;
}

export async function prepare_upload_file(
  filepath: string,
  options: {
    token: string;
    size: number;
    upload_chunk_size?: number;
  }
) {
  const { size, token, upload_chunk_size = 10 * 1024 * 1024 } = options;
  async function get_proof_code(filepath: string, size: number): Promise<Result<string>> {
    return new Promise((resolve) => {
      const md5_val = crypto.createHash("md5").update(Buffer.from(token, "utf8")).digest("hex");
      const md5_int = BigInt(`0x${md5_val.slice(0, 16)}`);
      const offset = parseInt((md5_int % BigInt(size)).toString(), 10);
      const bytes_to_read = Math.min(8, size - offset);
      const file_partial_buffer = Buffer.allocUnsafe(bytes_to_read);
      fs.createReadStream(filepath, { start: offset, end: offset + bytes_to_read })
        .on("data", (chunk: Buffer) => {
          chunk.copy(file_partial_buffer);
        })
        .on("end", () => {
          resolve(Result.Ok(Buffer.from(file_partial_buffer).toString("base64")));
        })
        .on("error", (error) => {
          resolve(Result.Err(error.message));
        });
    });
  }
  async function get_content_hash(filepath: string): Promise<
    Result<{
      hash: string;
      size: number;
    }>
  > {
    return new Promise((resolve) => {
      const content_hash = crypto.createHash("sha1");
      const stream = fs.createReadStream(filepath, { highWaterMark: upload_chunk_size });
      stream.on("data", (segment) => {
        content_hash.update(segment);
      });
      stream.on("end", () => {
        const result = content_hash.digest("hex").toUpperCase();
        return resolve(
          Result.Ok({
            size: stream.bytesRead,
            hash: result,
          })
        );
      });
      stream.on("error", (error) => {
        resolve(Result.Err(error.message));
      });
    });
  }
  const r1 = await get_content_hash(filepath);
  if (r1.error) {
    return Result.Err(r1.error.message);
  }
  const { hash: content_hash } = r1.data;
  const file_size = size;
  const r2 = await get_proof_code(filepath, size);
  if (r2.error) {
    return Result.Err(r2.error.message);
  }
  const proof_code = r2.data;
  const part_info_list = await get_part_info_list(file_size, upload_chunk_size);
  const body = {
    part_info_list,
    //     type: "file",
    size: file_size,
    content_hash,
    //       content_hash_name: "sha1",
    proof_code,
    //     proof_version: "v1",
  };
  return Result.Ok(body);
}

export async function prepare_upload_file2(
  file_buffer: Buffer,
  options: {
    token: string;
    upload_chunk_size?: number;
  }
) {
  const { token, upload_chunk_size = 10 * 1024 * 1024 } = options;
  async function get_part_info_list(fileSize: number) {
    const num_parts = Math.ceil(fileSize / upload_chunk_size);
    const part_info_list = [];
    for (let i = 1; i <= num_parts; i++) {
      part_info_list.push({ part_number: i });
    }
    return part_info_list;
  }
  async function get_proof_code(file_buffer: Buffer) {
    const md5_val = crypto.createHash("md5").update(Buffer.from(token, "utf8")).digest("hex");
    const md5_int = BigInt(`0x${md5_val.slice(0, 16)}`);
    const offset = parseInt((md5_int % BigInt(file_buffer.length)).toString(), 10);
    const bytes_to_read = Math.min(8, file_buffer.length - offset);
    const file_partial_buffer = file_buffer.slice(offset, offset + bytes_to_read);
    return Buffer.from(file_partial_buffer).toString("base64");
  }
  async function get_content_hash(file_buffer: Buffer) {
    const content_hash = crypto.createHash("sha1");
    for (let offset = 0; offset < file_buffer.length; offset += upload_chunk_size) {
      const segment = file_buffer.slice(offset, offset + upload_chunk_size);
      content_hash.update(segment);
    }
    const contentHashValue = content_hash.digest("hex").toUpperCase();
    return contentHashValue;
  }

  const file_size = file_buffer.length;
  const content_hash = await get_content_hash(file_buffer);
  const proof_code = await get_proof_code(file_buffer);
  const part_info_list = await get_part_info_list(file_size);
  const body = {
    part_info_list,
    //     type: "file",
    size: file_size,
    content_hash,
    //       content_hash_name: "sha1",
    proof_code,
    //     proof_version: "v1",
  };
  return body;
}

export type TheFilePrepareTransfer = {
  id: string;
  file_id: string;
  file_name: string;
  parent_file_id: string;
  parent_paths: string;
  type: FileType;
  episode_number: string;
  season_number: string;
};

export async function read_part_file(filepath: string, size: number, offset = 0): Promise<Result<Buffer>> {
  return new Promise((resolve) => {
    fs.open(filepath, "r", (err, fd) => {
      if (err) {
        return resolve(Result.Err(err.message));
      }
      const b = Buffer.alloc(size);
      fs.read(fd, b, offset, size, null, (err, bytesRead, buffer) => {
        if (err) {
          return resolve(Result.Err(err.message));
        }
        fs.close(fd, (err) => {
          if (err) {
            return resolve(Result.Err(err.message));
          }
          resolve(Result.Ok(buffer));
        });
      });
    });
  });
}

export function read_next_chunk(stream: ReadStream, chunk_size: number) {
  let bytesRead = 0;
  let data = "";
  return new Promise((resolve) => {
    stream.on("data", (chunk) => {
      bytesRead += chunk.length;
      data += chunk;
      if (bytesRead >= chunk_size) {
        stream.pause();
        resolve(Result.Ok(data));
      }
    });
    stream.on("end", () => {
      resolve(Result.Ok(data));
    });
    stream.on("error", (err) => {
      resolve(Result.Err(err.message));
    });
    // stream.resume();
  });
}

export async function file_info(file_path: string): Promise<
  Result<{
    size: number;
    file_type: "directory" | "file" | "unknown";
  }>
> {
  return new Promise((resolve) => {
    fs.stat(file_path, (err, stats) => {
      if (err) {
        const e = err as Error;
        return resolve(Result.Err(e.message));
      }
      return resolve(
        Result.Ok({
          size: stats.size,
          file_type: (() => {
            if (stats.isDirectory()) {
              return "directory";
            }
            if (stats.isFile()) {
              return "file";
            }
            return "unknown";
          })(),
        })
      );
    });
  });
}
