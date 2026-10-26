import { getAjustes, salvarAjustes } from "../../../lib/dados.mjs";
import { json, comSessao } from "../../../lib/http.mjs";
export const runtime = "nodejs";
export const PUT = comSessao(async (req) => {
  const b = await req.json().catch(() => null);
  if (!b || typeof b.aj !== "object" || !b.aj) return json({ erro: "ajustes inválidos" }, 400);
  if (JSON.stringify(b.aj).length > 2_000_000) return json({ erro: "ajustes grandes demais" }, 413);
  try { const etag = await salvarAjustes(b.aj, b.etag); return json({ ok: true, etag }); }
  catch (e) { if (e.code !== "CONFLITO") throw e; const cur = await getAjustes(); return json({ conflito: true, aj: cur.data, etag: cur.etag }, 409); }
});
