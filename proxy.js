// Toda página e API exige login, exceto as telas de entrada e redefinição de senha.
// Aqui só se confere se há sessão; a assinatura é validada em cada rota de dados (lib/http.mjs).
import { NextResponse } from "next/server";

const LIVRES = ["/login", "/esqueci", "/redefinir", "/api/auth/", "/api/admin/reseed"];

function sessaoValida(t) {
  try { const p = JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString()); return p.exp * 1000 > Date.now(); } catch { return false; }
}

export function proxy(req) {
  const { pathname, search } = req.nextUrl;
  if (req.method !== "GET" && req.method !== "HEAD") {
    const origin = req.headers.get("origin");
    if (origin && new URL(origin).host !== req.headers.get("host")) return new NextResponse("Origem não permitida", { status: 403 });
  }
  if (LIVRES.some((p) => pathname === p || pathname.startsWith(p))) return NextResponse.next();
  const t = req.cookies.get("sessao")?.value;
  if (t && sessaoValida(t)) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ erro: "Sessão expirada. Entre de novo." }, { status: 401 });
  const url = req.nextUrl.clone(); url.pathname = "/login"; url.search = pathname === "/" ? "" : "?volta=" + encodeURIComponent(pathname + search);
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"] };
