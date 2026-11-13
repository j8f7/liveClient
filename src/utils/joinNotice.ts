/**
 * "<name>进来啦！" arrival notices. The server sends them as REC:joinNotice and no
 * longer stores them in chat history; servers before v1.0.3 still send them as
 * chat messages, so the client recognises those too and shows them the same way.
 */
export function isJoinNotice(msg: { system?: boolean; cmd?: string } | undefined) {
  return Boolean(msg?.system) && typeof msg?.cmd === "string" && msg.cmd.endsWith("进来啦！");
}
