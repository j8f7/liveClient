// Messages the server sends as finished English sentences (socket
// "errorMessage"/"successMessage" and HTTP `{ error }` bodies). The server stays
// English-only; the client swaps in Chinese by exact text and shows anything it
// does not recognise unchanged. tests/i18n.test.ts checks that every socket
// message in server/room.ts has an entry here.
export const SERVER_MESSAGES_ZH: Record<string, string> = {
  // socket messages (server/room.ts)
  "Room controls are disabled. Choose a room from the lobby to watch.": "直播控制已关闭。请从大厅选择一个直播观看。",
  "Can't update the video while vbrowser is running": "虚拟浏览器运行期间无法更换视频",
  "There is already an active share in this room": "这个直播中已经有人在共享了",
  "Not the active sharer": "你不是当前的共享者",
  "Invalid vBrowser input": "虚拟浏览器输入无效",
  "A vBrowser is already running or starting in this room.": "这个直播中已有虚拟浏览器正在运行或启动。",
  "You must be logged in to start a vBrowser.": "登录后才能启动虚拟浏览器。",
  "Could not verify your account.": "无法验证你的账号。",
  "A verified email is required to start a VBrowser.": "需要先验证邮箱才能启动虚拟浏览器。",
  "There is already an active vBrowser for this user.": "该用户已有一个正在运行的虚拟浏览器。",
  "You must be logged in to lock the room.": "登录后才能锁定直播。",
  "Database is not available": "数据库不可用",
  "You've exceeded the permanent room limit. Subscribe for additional permanent rooms.": "你已超出永久直播的数量上限。订阅后可获得更多永久直播。",
  "Invalid room settings": "直播设置无效",
  "Password too long": "密码太长",
  "Custom URL too long": "自定义网址太长",
  "Room title too long": "直播标题太长",
  "Room description too long": "直播简介太长",
  "Invalid color code": "颜色代码无效",
  "Media source too long": "媒体来源太长",
  "Only the room owner can change these settings": "只有直播的所有者可以更改这些设置",
  "Saved admin settings": "管理设置已保存",
  // HTTP error bodies (server/server.ts)
  "Guest identity origin not allowed": "不允许从此来源获取访客身份",
  "This feature is disabled in lobby-only mode.": "仅大厅模式下此功能已关闭。",
  "subtitle storage is not available": "字幕存储不可用",
  "Access Denied": "拒绝访问",
  "youtube error": "YouTube 出错",
  "could not allocate a room name": "无法分配直播名称",
  "invalid user token": "用户凭证无效",
  "already subscribed": "已经订阅",
  "invalid return_url": "返回地址无效",
  "customer not found": "未找到客户信息",
  "invalid database client": "数据库不可用",
  "unsupported kind": "不支持的类型",
};

export function translateServerMessage(text: string, lang: string): string {
  if (lang !== "zh-CN" || typeof text !== "string") return text;
  return SERVER_MESSAGES_ZH[text] ?? text;
}
