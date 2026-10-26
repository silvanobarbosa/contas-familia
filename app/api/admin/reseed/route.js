import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { update } from "../../../../lib/store.mjs";

// Reset de bootstrap dos usuários. Inerte sem RESEED_SECRET (rota desligada).
// Gated por segredo em tempo constante. Remover depois do uso.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ok(req) {
  const want = process.env.RESEED_SECRET;
  if (!want) return false;
  const got = req.headers.get("x-reseed-secret") || "";
  const a = Buffer.from(got), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req) {
  if (!ok(req)) return NextResponse.json({ erro: "não autorizado" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const lista = Array.isArray(body.usuarios) ? body.usuarios : [];
  if (!lista.length) return NextResponse.json({ erro: "usuarios vazio" }, { status: 400 });
  const users = [];
  for (const u of lista) {
    const login = String(u.login || "").trim().toLowerCase();
    const senha = String(u.senha || "");
    if (!login || senha.length < 8) return NextResponse.json({ erro: "login/senha inválidos" }, { status: 400 });
    users.push({ login, nome: u.nome || login, email: u.email || login, hash: await bcrypt.hash(senha, 12), falhas: 0, bloqueadoAte: 0 });
  }
  const r = await update("sistema/usuarios.json", () => ({ users }), { users });
  return NextResponse.json({ ok: true, users: r.data.users.map((x) => ({ login: x.login, email: x.email })) });
}
