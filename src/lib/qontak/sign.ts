import crypto from "node:crypto";

/**
 * Header Authorization HMAC gateway Mekari. Dipisah dari client.ts (yang
 * `server-only`) supaya bisa diuji langsung dengan vektor dokumentasi.
 *
 *   signature = base64( HMAC-SHA256( secret, "date: <RFC 7231>\n<METHOD> <path+query> HTTP/1.1" ) )
 */
export function signRequest(method: string, pathWithQuery: string, clientId: string, secret: string, date: string): string {
  const requestLine = `${method.toUpperCase()} ${pathWithQuery} HTTP/1.1`;
  const signature = crypto.createHmac("sha256", secret).update(`date: ${date}\n${requestLine}`).digest("base64");
  return `hmac username="${clientId}", algorithm="hmac-sha256", headers="date request-line", signature="${signature}"`;
}
