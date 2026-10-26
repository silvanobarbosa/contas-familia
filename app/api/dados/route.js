import { getBase, getAjustes } from "../../../lib/dados.mjs";
import cls from "../../../seed/classificacao.json" with { type: "json" };
import { json, comSessao } from "../../../lib/http.mjs";
export const runtime = "nodejs";
export const maxDuration = 30;
export const GET = comSessao(async (req, u) => {
  const [base, aj] = await Promise.all([getBase(), getAjustes()]);
  return json({ user: u, base, cls, aj: aj.data, ajEtag: aj.etag });
});
