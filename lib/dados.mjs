// Arquivos enviados, lançamentos extraídos e a base consolidada que o painel lê.
import { parseFile, sha256 } from "./parsers.mjs";
import { readJSON, readBuf, write, remove, update } from "./store.mjs";
import seedAjustes from "../seed/ajustes.json" with { type: "json" };

const INDICE = "dados/indice.json", BASE = "dados/base.json", AJUSTES = "dados/ajustes.json";
const lancPath = (sha) => `dados/lanc/${sha}.json`;
const addM = (m, n) => { let y = +m.slice(0, 4), mo = +m.slice(5, 7) - 1 + n; y += Math.floor(mo / 12); mo = ((mo % 12) + 12) % 12; return y + "-" + String(mo + 1).padStart(2, "0"); };
const safeName = (n) => String(n).normalize("NFC").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 120);
export const MAX_BYTES = 4 * 1024 * 1024;

export async function getIndice() { const r = await readJSON(INDICE); return r ? r.data : { arquivos: [] }; }

export async function receber(buf, nome, quem) {
  const sha = sha256(buf);
  const idx = await getIndice();
  const dup = idx.arquivos.find((a) => a.sha === sha);
  if (dup) return { status: "duplicado", mensagem: `Já enviado antes como “${dup.nome}” em ${new Date(dup.em).toLocaleDateString("pt-BR")}.` };
  let r;
  try { r = await parseFile(buf, nome); } catch (e) { return { status: "erro", mensagem: String(e.message || e) }; }
  const path = `originais/${sha.slice(0, 12)}-${safeName(nome)}`;
  await write(path, buf, { contentType: "application/octet-stream" });
  if (!r.ignorado) await write(lancPath(sha), r.rows);
  const reg = { sha, nome, path, tamanho: buf.length, enviadoPor: quem, em: new Date().toISOString(),
    info: r.info, avisos: r.avisos || [], fatura: r.fatura || null, saldos: r.saldos || {}, ignorado: Boolean(r.ignorado) };
  await update(INDICE, (d) => { if (!d.arquivos.some((a) => a.sha === sha)) d.arquivos.push(reg); return d; }, { arquivos: [] });
  await reconstruir();
  return { status: r.ignorado ? "ignorado" : "ok", info: r.info, avisos: r.avisos || [], lancamentos: r.rows.length };
}

export async function excluir(sha) {
  let alvo = null;
  await update(INDICE, (d) => { alvo = d.arquivos.find((a) => a.sha === sha) || null; d.arquivos = d.arquivos.filter((a) => a.sha !== sha); return d; }, { arquivos: [] });
  if (!alvo) return false;
  await Promise.all([remove(alvo.path).catch(() => {}), remove(lancPath(sha)).catch(() => {})]);
  await reconstruir();
  return true;
}

export async function original(sha) {
  const a = (await getIndice()).arquivos.find((x) => x.sha === sha);
  if (!a) return null;
  const r = await readBuf(a.path);
  return r ? { nome: a.nome, buf: r.buf } : null;
}

/** Junta todos os arquivos numa base só. Um lançamento que aparece em dois arquivos (extratos que se sobrepõem) entra uma vez. */
export async function reconstruir() {
  for (let tent = 0; tent < 3; tent++) {
    const ri = await readJSON(INDICE); const idx = ri ? ri.data : { arquivos: [] };
    const ordem = [...idx.arquivos].sort((a, b) => (a.em < b.em ? -1 : 1));
    const lotes = await Promise.all(ordem.map((a) => (a.ignorado ? [] : readJSON(lancPath(a.sha)).then((r) => (r ? r.data : [])))));
    const porId = new Map(), saldos = {}, faturas = new Map(), avisos = [];
    ordem.forEach((a, i) => {
      for (const x of lotes[i]) porId.set(x.id, x);
      for (const [conta, ms] of Object.entries(a.saldos || {})) { saldos[conta] ||= {};
        for (const [m, sv] of Object.entries(ms)) if (!saldos[conta][m] || sv[1] >= saldos[conta][m][1]) saldos[conta][m] = sv; }
      if (a.fatura) faturas.set(a.fatura.conta + "|" + a.fatura.vencimento, a.fatura);
      avisos.push(...(a.avisos || []));
    });
    const rows = [...porId.values()];
    // conferência do Sicredi: saldo do mês anterior + lançamentos do mês = saldo do mês
    const ss = saldos["sicredi-cc"] || {}, som = {};
    for (const x of rows) if (x.conta === "sicredi-cc") { const m = x.d.slice(0, 7); som[m] = (som[m] || 0) + x.v; }
    const arquivos = ordem.map((a) => {
      const f = { ...a.info, arquivo: a.nome, sha: a.sha, enviadoPor: a.enviadoPor, em: a.em, tamanho: a.tamanho, ignorado: a.ignorado || undefined };
      if (a.info.conta === "sicredi-cc" && a.info.periodo && a.info.periodo[0]) { const m = a.info.periodo[0].slice(0, 7), ant = ss[addM(m, -1)];
        if (ant && ss[m]) f.validado = Math.abs(ant[0] + (som[m] || 0) - ss[m][0]) < 0.02; }
      return f;
    });
    const base = { gerado_em: new Date().toISOString(), rows, arquivos, faturas: [...faturas.values()], saldos, avisos: [...new Set(avisos)] };
    await write(BASE, base);
    const depois = await readJSON(INDICE);
    if (!depois || !ri || depois.etag === ri.etag) return base; // ninguém mexeu no índice enquanto montávamos
  }
}

export async function getBase() { const r = await readJSON(BASE); return r ? r.data : { gerado_em: "", rows: [], arquivos: [], faturas: [], saldos: {}, avisos: [] }; }

export async function getAjustes() { const r = await readJSON(AJUSTES); return r ? r : { data: seedAjustes, etag: null }; }
export async function salvarAjustes(aj, etag) { return write(AJUSTES, aj, { etag: etag || null }); }
