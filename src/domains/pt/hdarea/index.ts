import { load } from "cheerio";

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
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
        cookie:
          "c_secure_uid=MTI4MTQx; c_secure_pass=93febb254b7fae50998453919840b591; c_secure_ssl=eWVhaA%3D%3D; c_secure_tracker_ssl=eWVhaA%3D%3D; c_secure_login=bm9wZQ%3D%3D; _gid=GA1.2.891437793.1714460332; _ga_P7FXS6LFMX=GS1.1.1714460332.74.1.1714460437.0.0.0; _ga=GA1.2.1564835905.1699610130",
        priority: "u=0, i",
        referer:
          "https://hdarea.club/torrents.php?incldead=1&spstate=0&inclbookmarked=0&search=%E5%B0%91%E5%B9%B4%E5%B7%B4%E6%AF%94%E4%BC%A6&search_area=0&search_mode=0",
        "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"macOS"',
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "same-origin",
        "sec-fetch-user": "?1",
        "upgrade-insecure-requests": "1",
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
    const $ = load(r1.data);
    const records_html: string[] = [];
    $(".nonstick_outer_bg").each((i, el) => {
      const text = $(el).html();
      if (text) {
        records_html.push(text);
      }
    });
    return Result.Ok({
      page_siz: values.page_size,
      page: values.page,
      total: records_html.length,
      list: records_html.map((item) => {
        const url_r = /href="(\/info-[^"]{1,})\/"/;
        const url = item.match(url_r);
        const name_r = /href="\/info-[^"]{1,}\/"[^>]{1,}>([^<]{1,})<\/a/;
        const name = item.match(name_r);
        return {
          id: (() => {
            if (!url) {
              return null;
            }
            const r = url[1].match(/[0-9]{1,}/);
            if (!r) {
              return null;
            }
            return r[0];
          })(),
          name: name ? name[1] : null,
          url: url ? url[1] : null,
	  downloadState: {
		
	  },
        };
      }),
    });
  }
}
