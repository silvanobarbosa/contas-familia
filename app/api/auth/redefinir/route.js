import { usarReset } from "../../../../lib/auth.mjs";
import { json } from "../../../../lib/http.mjs";
export const runtime = "nodejs";
export async function POST(req) {
  const b = await req.json().catch(() => ({}));
  const r = await usarReset(b.u, b.t, b.senha);
  return r.erro ? json({ erro: r.erro }, 400) : json({ ok: true });
}
