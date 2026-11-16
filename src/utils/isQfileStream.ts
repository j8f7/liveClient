/** Episode playlist of a netdisk show room served by our server: qfile.qq.com shows at
 * /qfile/<room>/<episode>/index.m3u8, byte-range HLS shows at /brhls/<room>/0/index.m3u8.
 * Both use the same segment loader (no Referer, ?link=1 lookup, Range for byte ranges). */
export const isQfileStream = (input: string) => {
  // The server may sit under a path prefix (https://host/watchparty/qfile/...).
  return /(^|\/\/[^/]+(\/[\w.-]+)*)\/(qfile|brhls)\/[\w-]+\/\d+\/index\.m3u8$/.test(input);
};
