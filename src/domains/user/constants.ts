export enum AuthenticationProviders {
  /** 微信小程序 */
  Weapp = "weapp",
  /** 邮箱、密码 凭证 */
  Credential = "credential",
}

export enum SubscriptionStep {
  Enabled,
}
export enum InvoiceStatus {
  WaitingForPayment,
  Paid,
  Completed,
}
export enum OrderStatus {
  WaitingForPayment,
  Paid,
  Completed,
}
