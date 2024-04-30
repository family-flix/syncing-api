import Joi from "joi";

import { HS256 } from "@/modules/worktop/jwt";
import { DataStore } from "@/domains/store/types";
import { Result, resultify } from "@/types/index";

import { AuthenticationProviders } from "./constants";
import { compare, prepare } from "./utils";
import { parseJSONStr } from "@/utils";

const CredentialsSchema = Joi.object({
  email: Joi.string()
    .email({ tlds: { allow: false } })
    .message("邮箱错误")
    .required(),
  password: Joi.string().pattern(new RegExp("^[a-zA-Z0-9.]{8,30}$")).message("密码必须包含大写字母、数字").required(),
});
interface Credentials {
  email: string;
  password: string;
}
interface TokenData {
  uid: string;
  salt: string;
}
type UserSettings = {
  site: { hostname: string; token: string };
  paths: { file: string; torrent: string };
};
const JWT = HS256<TokenData>({
  key: "flex",
  expires: 86400, // 24 hours
});

export type UserUniqueID = number;
type MemberProps = {
  id: UserUniqueID;
  nickname: null | string;
  token: string;
  subscription: null | { name: string; expired_at: Date };
  settings: null | UserSettings;
  store: DataStore;
};

export class User {
  /**
   * User 类工厂函数
   * @param token
   * @returns
   */
  static async New(token: string | undefined, store: DataStore) {
    if (!token) {
      return Result.Err("缺少 token", 900);
    }
    try {
      const r = await JWT.verify(token);
      const id = r.id as UserUniqueID;
      const user = await store.prisma.user.findUnique({
        where: { id },
      });
      if (user === null) {
        return Result.Err("无效身份凭证", 900);
      }
      const { nickname, settings } = user;
      return Result.Ok(
        new User({
          id,
          nickname,
          subscription: null,
          settings: (() => {
            if (settings === "") {
              return null;
            }
            const r2 = parseJSONStr<UserSettings>(settings);
            if (r2.error) {
              return null;
            }
            return r2.data;
          })(),
          token,
          store,
        })
      );
      // return Result.Ok({ id: member.id, nickname: member.nickname });
    } catch (err) {
      const e = err as Error;
      return Result.Err(e.message, 900);
    }
  }
  static async Get(body: { id: UserUniqueID; store: DataStore }) {
    const { id, store } = body;
    const member = await store.prisma.user.findUnique({
      where: { id },
    });
    if (!member) {
      return Result.Err("不存在");
    }
    const { nickname, settings } = member;
    return Result.Ok(
      new User({
        id,
        nickname,
        subscription: null,
        settings: (() => {
          if (settings === "") {
            return null;
          }
          const r2 = parseJSONStr<UserSettings>(settings);
          if (r2.error) {
            return null;
          }
          return r2.data;
        })(),
        token: "",
        store,
      })
    );
  }
  /** 注册 */
  static async Create(values: {
    provider: AuthenticationProviders;
    provider_id: string;
    provider_arg1: string;
    provider_arg2?: string;
    provider_arg3?: string;
    store: DataStore;
  }) {
    const { provider, store } = values;
    if (provider === AuthenticationProviders.Credential) {
      const { provider_id, provider_arg1 } = values;
      console.log(provider_id, provider_arg1);
      const r = await resultify(CredentialsSchema.validateAsync.bind(CredentialsSchema))({
        email: provider_id,
        password: provider_arg1,
      });
      console.log(r.error);
      if (r.error) {
        return Result.Err(r.error);
      }
      const { email, password: pw } = r.data as Credentials;
      const existing_member_account = await store.prisma.account.findUnique({
        where: {
          provider_provider_id: {
            provider: AuthenticationProviders.Credential,
            provider_id: email,
          },
        },
        include: {
          user: true,
        },
      });
      if (existing_member_account !== null) {
        return Result.Err("该邮箱已注册", 400);
      }
      const { password, salt } = await prepare(pw);
      const nickname = email.split("@").shift()!;
      const created_user = await store.prisma.user.create({
        data: {
          nickname,
          settings: "{}",
          accounts: {
            create: {
              type: "Credential",
              provider: AuthenticationProviders.Credential,
              provider_id: email,
              provider_arg1: password,
              provider_arg2: salt,
            },
          },
        },
      });
      const res = await User.Token({ id: created_user.id });
      if (res.error) {
        return Result.Err(res.error);
      }
      const token = res.data;
      return Result.Ok(new User({ id: created_user.id, nickname, token, subscription: null, settings: null, store }));
    }
    return Result.Err("未知的 provider");
  }
  static async Validate(values: {
    provider: AuthenticationProviders;
    provider_id?: string;
    provider_arg1?: string;
    store: DataStore;
  }) {
    const { provider, store } = values;
    if (provider === AuthenticationProviders.Credential) {
      const { provider_id, provider_arg1 } = values;
      const r = await resultify(CredentialsSchema.validateAsync.bind(CredentialsSchema))({
        email: provider_id,
        password: provider_arg1,
      });
      if (r.error) {
        return Result.Err(r.error);
      }
      const { email, password } = r.data as Credentials;
      const credential = await store.prisma.account.findUnique({
        where: {
          provider_provider_id: {
            provider: AuthenticationProviders.Credential,
            provider_id: email,
          },
        },
        include: {
          user: true,
        },
      });
      if (credential === null) {
        return Result.Err("该邮箱不存在", 904);
      }
      if (credential.provider_arg1 === null || credential.provider_arg2 === null) {
        return Result.Err("信息异常");
      }
      const matched = await compare(
        {
          password: credential.provider_arg1,
          salt: credential.provider_arg2,
        },
        password
      );
      if (!matched) {
        return Result.Err("密码错误");
      }
      const member_id = credential.user_id;
      const res = await User.Token({ id: member_id });
      if (res.error) {
        return Result.Err(res.error);
      }
      const token = res.data;
      const { nickname } = credential.user;
      return Result.Ok(
        new User({
          id: member_id,
          nickname,
          subscription: null,
          settings: null,
          token,
          store,
        })
      );
    }
    return Result.Err("未知的 provider 类型");
  }
  /** 生成一个 token */
  static async Token(values: { id: UserUniqueID }): Promise<Result<string>> {
    try {
      const token = await JWT.sign(values);
      return Result.Ok(token);
    } catch (err) {
      const e = err as Error;
      return Result.Err(e);
    }
  }

  /** 用户 id */
  id: UserUniqueID;
  nickname: string = "unknown";
  avatar: string | null = null;
  subscription: { name: string; expired_at: Date } | null = null;
  settings: {
    site: {
      hostname: string;
      token: string;
    };
    paths: {
      /** 种子文件 */
      torrent: string;
      /** 下载好的文件 */
      file: string;
    };
  } | null = null;
  /** JWT token */
  token: string;
  store: DataStore;

  constructor(props: MemberProps) {
    const { id, nickname, token, subscription, settings, store } = props;
    this.id = id;
    this.nickname = nickname || "unknown";
    this.token = token;
    this.subscription = subscription;
    this.settings = settings;
    this.store = store;
  }
  async profile() {
    // const user = await this.store.prisma.user.findUnique({
    //   where: {
    //     id: this.id,
    //   },
    // });
    // if (!user) {
    //   return Result.Err("用户不存在");
    // }
    // const { nickname } = user;
    return Result.Ok({
      nickname: this.nickname,
      settings: this.settings,
    });
  }
  async update_settings(values: UserSettings) {
    const next_settings = (() => {
      if (this.settings === null) {
        return values;
      }
      return {
        ...this.settings,
        ...values,
      };
    })();
    await this.store.prisma.user.update({
      where: {
        id: this.id,
      },
      data: {
        settings: JSON.stringify(next_settings),
      },
    });
    this.settings = { ...next_settings };
    return Result.Ok(null);
  }
  /** 补全邮箱和密码 */
  async patch_credential(values: { email?: string; password?: string }) {
    return Result.Err("");
    // const { email, password: pw } = values as Credentials;
    // const r = await resultify(credentialsSchema.validateAsync.bind(credentialsSchema))(values);
    // if (r.error) {
    // 	return Result.Err(r.error);
    // }
    // const existing_member_account = await this.store.prisma.member_authentication.findFirst({
    // 	where: { provider: AuthenticationProviders.Credential, provider_id: email, member_id: this.id },
    // 	include: {
    // 		member: true,
    // 	},
    // });
    // if (existing_member_account) {
    // 	return Result.Err('已经有邮箱与密码了');
    // }
    // const { password, salt } = await prepare(pw);
    // const created = await this.store.prisma.member_authentication.create({
    // 	data: {
    // 		provider: AuthenticationProviders.Credential,
    // 		provider_id: email,
    // 		provider_arg1: password,
    // 		provider_arg2: salt,
    // 		member_id: this.id,
    // 	},
    // });
    // return Result.Ok(created);
  }
}
