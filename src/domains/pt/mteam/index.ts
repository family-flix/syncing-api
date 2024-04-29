import { HttpClientCore } from "@/domains/http_client/index";
import { connect } from "@/domains/http_client/provider.axios";
import { RequestCoreV2 } from "@/domains/request";
import { Result } from "@/types/index";

import {
  fetch_torrent_detail,
  fetch_torrent_download_link,
  fetch_torrent_download_progress,
  search_media,
} from "./services";

export class MTeamPTClient {
  client: HttpClientCore;
  $search: RequestCoreV2<{ fetch: typeof search_media; client: HttpClientCore }>;
  $progress: RequestCoreV2<{ fetch: typeof fetch_torrent_download_progress; client: HttpClientCore }>;
  $profile: RequestCoreV2<{ fetch: typeof fetch_torrent_detail; client: HttpClientCore }>;
  $download: RequestCoreV2<{ fetch: typeof fetch_torrent_download_link; client: HttpClientCore }>;

  constructor() {
    const _client = new HttpClientCore({
      hostname: "",
      headers: {
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
        authorization:
          "eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiJsaXRhbyIsInVpZCI6MzEwNTI5LCJqdGkiOiJjZDExNzQ5ZC01MDE1LTRjMzQtOWQ1YS0zMzhhMjFlZWE3OGEiLCJpc3MiOiJodHRwczovL2twLm0tdGVhbS5jYyIsImlhdCI6MTcxNDM1NTQ0MywiZXhwIjoxNzE2OTQ3NDQzfQ.ZLgt1Vg1gurDQjWXpYqE28qlcsyGdC4fhfIdZlAirhrV0WEGt8Yq_d6XsaPqsHyEtHqVNTUDJzSa54isGvzgCw",
        origin: "https://kp.m-team.cc",
        priority: "u=1, i",
        referer: "https://kp.m-team.cc/",
        "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"macOS"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "cross-site",
        ts: "X",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
    });
    connect(_client);
    const client = {
      async get<T>(...args: Parameters<typeof _client.get>) {
        const r = await _client.get<{ code: string; message: string; data: T }>(...args);
        if (r.error) {
          return Result.Err(r.error.message);
        }
        const { code, message, data } = r.data;
        if (Number(code) !== 0) {
          return Result.Err(message);
        }
        return Result.Ok(data);
      },
      async post<T>(...args: Parameters<typeof _client.post>) {
        const r = await _client.post<{ code: string; message: string; data: T }>(...args);
        if (r.error) {
          return Result.Err(r.error.message);
        }
        const { code, message, data } = r.data;
        if (Number(code) !== 0) {
          return Result.Err(message);
        }
        return Result.Ok(data);
      },
    };
    // @ts-ignore
    this.client = client;

    this.$search = new RequestCoreV2({
      fetch: search_media,
      client: this.client,
    });
    this.$progress = new RequestCoreV2({
      fetch: fetch_torrent_download_progress,
      client: this.client,
    });
    this.$download = new RequestCoreV2({
      fetch: fetch_torrent_download_link,
      client: this.client,
    });
    this.$profile = new RequestCoreV2({
      fetch: fetch_torrent_detail,
      client: this.client,
    });
  }

  async search(values: { page: number; page_size: number; keyword: string }) {
    const r1 = await this.$search.run(values);
    if (r1.error) {
      return Result.Err(r1.error.message);
    }
    const { pageNumber, pageSize, total, data } = r1.data;
    const ids = data.map((torrent) => torrent.id);
    const r2 = await this.$progress.run({ ids });
    if (r2.error) {
      return Result.Err(r2.error.message);
    }
    return Result.Ok({
      page_size: Number(pageSize),
      page: Number(pageNumber),
      total: Number(total),
      list: data.map((torrent) => {
        const { id, name, smallDescr } = torrent;
        const status = r2.data.historyMap[id];
        // console.log("name", smallDescr, status);
        return {
          ...torrent,
          downloadStatus: status
            ? {
                // completed: status.timesCompleted === "1",
                completed: true,
              }
            : null,
        };
      }),
    });
  }
}
