import { receber, excluir, MAX_BYTES } from "../../../lib/dados.mjs";
import { json, comSessao } from "../../../lib/http.mjs";
export const runtime = "nodejs";
export const maxDuration = 60;
export const POST = comSessao(async (req, u) => {
  const fd = await req.formData().catch(() => null);
  const f = fd && fd.get("arquivo");
  if (!f || typeof f === "string") return json({ erro: "Nenhum arquivo recebido." }, 400);
  if (f.size > MAX_BYTES) return json({ status: "erro", mensagem: `Arquivo com ${(f.size / 1048576).toFixed(1)} MB; o limite é 4 MB.` }, 413);
  if (!/\.(ofx|csv|pdf|xlsx)$/i.test(f.name)) return json({ status: "erro", mensagem: "Formato não aceito. Envie OFX, CSV, PDF ou XLSX." }, 415);
  const r = await receber(Buffer.from(await f.arrayBuffer()), f.name, u.nome);
  return json(r, r.status === "erro" ? 422 : 200);
});
export const DELETE = comSessao(async (req) => {
  const sha = new URL(req.url).searchParams.get("sha") || "";
  if (!/^[0-9a-f]{64}$/.test(sha)) return json({ erro: "arquivo inválido" }, 400);
  return (await excluir(sha)) ? json({ ok: true }) : json({ erro: "arquivo não encontrado" }, 404);
});
