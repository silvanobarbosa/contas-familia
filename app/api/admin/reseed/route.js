import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { reseed } from "../../../../lib/auth.mjs";

// Reset de bootstrap dos usuários a partir do SEED_USERS. Inerte sem RESEED_SECRET
// configurado (rota fica desligada). Gated por segredo em tempo constante.
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
  const db = await reseed();
  return NextResponse.json({ ok: true, users: db.users.map((u) => u.login) });
}
