import { request } from "@/domains/request/utils";
import { Result } from "@/types/index";
import FormData from "form-data";

export function search_media(params: { page_size: number; page: number; keyword: string }) {
  return request.post<{
    pageNumber: string;
    pageSize: string;
    total: string;
    totalPages: string;
    data: {
      id: string;
      createdDate: string;
      lastModifiedDate: string;
      name: string;
      smallDescr: string;
      imdb: string;
      imdbRating: string;
      douban: string;
      doubanRating: string;
      dmmCode: null;
      author: null;
      category: string;
      source: string;
      medium: string;
      standard: string;
      videoCodec: string;
      audioCodec: string;
      team: string;
      processing: string;
      numfiles: string;
      size: string;
      tags: string;
      labels: string;
      msUp: number;
      anonymous: boolean;
      infoHash: null;
      status: {
        id: string;
        createdDate: string;
        lastModifiedDate: string;
        pickType: string;
        toppingLevel: number;
        toppingEndTime: string;
        discount: string;
        discountEndTime: string;
        timesCompleted: string;
        comments: string;
        lastAction: string;
        views: string;
        hits: string;
        support: number;
        oppose: number;
        status: string;
        seeders: string;
        leechers: string;
        banned: boolean;
        visible: boolean;
      };
      editedBy: null;
      editDate: null;
      collection: boolean;
      inRss: boolean;
      canVote: boolean;
      imageList: string[];
      resetBox: null;
    }[];
  }>("https://kp.m-team.cc/api/torrent/search", {
    categories: [],
    keyword: params.keyword,
    mode: "normal",
    pageNumber: params.page,
    pageSize: params.page_size || 100,
    standards: ["6"],
    visible: 1,
  });
}

/** 获取种子下载进度 */
export function fetch_torrent_download_progress(params: { ids: string[] }) {
  return request.post<{
    peerMap: Record<
      string,
      {
        uid: string;
        tid: string;
        ip: string;
        ipv6: null;
        port: string;
        agent: string;
        peerId: string;
        left: string;
        uploaded: string;
        downloaded: string;
        lastAction: string;
        createdDate: string;
        boxLimit: boolean;
      }
    >;
    historyMap: Record<
      string,
      {
        id: string;
        createdDate: string;
        lastModifiedDate: string;
        userid: string;
        torrent: string;
        uploaded: string;
        download: string;
        uploadedReal: string;
        downloadedReal: string;
        seedtime: string;
        leechtime: string;
        // 为 1 表示下载完成
        timesCompleted: string;
        lastCompleteDate: string;
        lastAction: string;
        startDate: null;
      }
    >;
  }>("https://kp.m-team.cc/api/tracker/queryHistory", {
    tids: params.ids,
  });
}

export function fetch_torrent_detail(id: number) {
  const body = new FormData();
  body.append("id", String(id));
  return request.post<{
    id: string;
    createdDate: string;
    lastModifiedDate: string;
    name: string;
    smallDescr: string;
    imdb: string;
    imdbRating: null;
    douban: string;
    doubanRating: string;
    dmmCode: null;
    author: null;
    category: string;
    source: string;
    medium: string;
    standard: string;
    videoCodec: string;
    audioCodec: string;
    team: string;
    processing: string;
    numfiles: string;
    size: string;
    tags: string;
    labels: string;
    msUp: number;
    anonymous: boolean;
    infoHash: null;
    status: {
      id: string;
      createdDate: string;
      lastModifiedDate: string;
      pickType: string;
      toppingLevel: number;
      toppingEndTime: string;
      discount: string;
      discountEndTime: string;
      timesCompleted: string;
      comments: string;
      lastAction: string;
      views: string;
      hits: string;
      support: number;
      oppose: number;
      status: string;
      seeders: string;
      leechers: string;
      banned: boolean;
      visible: boolean;
    };
    editedBy: null;
    editDate: null;
    collection: boolean;
    inRss: boolean;
    canVote: boolean;
    imageList: null;
    resetBox: null;
    originFileName: string;
    descr: string;
    nfo: null;
    mediainfo: string;
    cids: null;
    aids: null;
    showcaseList: unknown[];
    tagList: unknown[];
    thanked: boolean;
    rewarded: boolean;
  }>("https://kp.m-team.cc/api/torrent/detail", body, {
    headers: {
      ...body.getHeaders(),
    },
  });
}
/** 获取资源种子下载链接 */
export function fetch_torrent_download_link(id: number) {
  const body = new FormData();
  body.append("id", String(id));
  return request.post<string>("https://kp.m-team.cc/api/torrent/genDlToken", body, {
    headers: {
      ...body.getHeaders(),
    },
  });
}
