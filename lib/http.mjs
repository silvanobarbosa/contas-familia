import { NextResponse } from "next/server";
import { sessao } from "./auth.mjs";
export const json = (d, status = 200) => NextResponse.json(d, { status, headers: { "Cache-Control": "no-store" } });
export const html = (s) => new Response(s, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
/** Executa a rota só com sessão válida; devolve 401 caso contrário. */
export const comSessao = (fn) => async (req, ctx) => {
  const u = await sessao(req);
  if (!u) return json({ erro: "Sessão expirada. Entre de novo." }, 401);
  try { return await fn(req, u, ctx); } catch (e) { console.error(e); return json({ erro: "Erro no servidor: " + String(e.message || e).slice(0, 200) }, 500); }
};
export const origemDe = (req) => process.env.APP_URL || `${req.headers.get("x-forwarded-proto") || "https"}://${req.headers.get("host")}`;
