import { original } from "../../../../lib/dados.mjs";
import { json, comSessao } from "../../../../lib/http.mjs";
export const runtime = "nodejs";
const TIPOS = { pdf: "application/pdf", csv: "text/csv", ofx: "application/x-ofx", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
export const GET = comSessao(async (req) => {
  const sha = new URL(req.url).searchParams.get("sha") || "";
  const r = /^[0-9a-f]{64}$/.test(sha) ? await original(sha) : null;
  if (!r) return json({ erro: "arquivo não encontrado" }, 404);
  const ext = r.nome.split(".").pop().toLowerCase();
  return new Response(r.buf, { headers: { "Content-Type": TIPOS[ext] || "application/octet-stream", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(r.nome)}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
});
