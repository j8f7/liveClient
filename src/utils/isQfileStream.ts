/** Episode playlist of a qfile.qq.com show room, served by our server at /qfile/<room>/<episode>/index.m3u8. */
export const isQfileStream = (input: string) => {
  // The server may sit under a path prefix (https://host/watchparty/qfile/...).
  return /(^|\/\/[^/]+(\/[\w.-]+)*)\/qfile\/[\w-]+\/\d+\/index\.m3u8$/.test(input);
};
