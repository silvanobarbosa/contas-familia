import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { updateUsers } from "../../../../lib/auth.mjs";

// Renomeia o login/e-mail de um usuário PRESERVANDO a senha (hash). Gated por ADMIN_SECRET
// (inerte sem o segredo). Temporário — remover após o uso.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ok(req) {
  const want = process.env.ADMIN_SECRET;
  if (!want) return false;
  const got = req.headers.get("x-admin-secret") || "";
  const a = Buffer.from(got), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req) {
  if (!ok(req)) return NextResponse.json({ erro: "não autorizado" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const oldLogin = String(body.oldLogin || "").trim().toLowerCase();
  const newLogin = String(body.newLogin || "").trim().toLowerCase();
  const newEmail = String(body.newEmail || newLogin).trim();
  if (!oldLogin || !newLogin) return NextResponse.json({ erro: "oldLogin/newLogin obrigatórios" }, { status: 400 });

  let resultado = "nao_encontrado";
  const db = await updateUsers((d) => {
    if (d.users.some((u) => u.login === newLogin && u.login !== oldLogin)) { resultado = "novo_login_em_uso"; return d; }
    const u = d.users.find((x) => x.login === oldLogin);
    if (!u) { resultado = "nao_encontrado"; return d; }
    u.login = newLogin;
    u.email = newEmail;
    resultado = "ok";
    return d;
  });
  const status = resultado === "ok" ? 200 : resultado === "novo_login_em_uso" ? 409 : 404;
  return NextResponse.json({ resultado, users: db.users.map((u) => ({ login: u.login, email: u.email })) }, { status });
}
