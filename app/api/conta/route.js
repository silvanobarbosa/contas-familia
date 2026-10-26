import { NextResponse } from "next/server";
import { trocarSenha, trocarEmail, COOKIE, cookieOpts } from "../../../lib/auth.mjs";
import { emailConfigurado } from "../../../lib/mail.mjs";
import { json, comSessao } from "../../../lib/http.mjs";
export const runtime = "nodejs";
export const GET = comSessao(async (req, u) => json({ user: u, emailConfigurado: emailConfigurado() }));
export const POST = comSessao(async (req, u) => {
  const b = await req.json().catch(() => ({}));
  if (b.acao === "senha") {
    const r = await trocarSenha(u.login, b.atual, b.nova); if (r.erro) return json({ erro: r.erro }, 400);
    // a troca derruba as sessões antigas; esta recebe uma nova pedindo login de novo
    const res = NextResponse.json({ ok: true, mensagem: "Senha alterada. Entre de novo com a nova senha." }); res.cookies.set(COOKIE, "", { ...cookieOpts, maxAge: 0 }); return res;
  }
  if (b.acao === "email") { const r = await trocarEmail(u.login, b.email); return r.erro ? json({ erro: r.erro }, 400) : json({ ok: true, mensagem: "E-mail salvo." }); }
  return json({ erro: "ação desconhecida" }, 400);
});
