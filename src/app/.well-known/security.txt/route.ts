import { publicOrigin } from "@/lib/site";
import { CONTACT } from "@/lib/constants";

/** RFC 9116 security contact. */
export function GET() {
  const expires = new Date(Date.now() + 180 * 86400_000).toISOString();
  const body = `Contact: mailto:${CONTACT.security}\nExpires: ${expires}\nPreferred-Languages: en\nPolicy: ${publicOrigin()}/security\nCanonical: ${publicOrigin()}/.well-known/security.txt\n`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
