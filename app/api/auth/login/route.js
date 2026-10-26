import { NextResponse } from "next/server";
import { login, COOKIE, cookieOpts } from "../../../../lib/auth.mjs";
export const runtime = "nodejs";
export async function POST(req) {
  const b = await req.json().catch(() => ({}));
  const r = await login(b.login, b.senha);
  if (r.erro) return NextResponse.json({ erro: r.erro }, { status: 401 });
  const res = NextResponse.json({ ok: true, user: r.user });
  res.cookies.set(COOKIE, r.token, cookieOpts);
  return res;
}
