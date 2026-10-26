// Leitores dos arquivos bancários da família.
// Sicredi: extrato OFX e fatura CSV · Itaú: extrato e fatura em PDF · C6: planilha XLSX · lançamentos manuais em CSV.
// Cada leitor devolve lançamentos num formato único e as informações de conferência do arquivo.
import { createHash } from "node:crypto";

export const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
// mesmo identificador gerado pelo normalizador em Python (números inteiros viram "185.0", como no str() do Python)
const pyf = (x) => (Number.isInteger(x) ? x.toFixed(1) : String(x));
const hid = (...a) => createHash("sha1").update(a.join("|")).digest("hex").slice(0, 10);
const num = (s) => { const v = parseFloat(String(s ?? "").replace(/R\$|U\$|"/g, "").trim().replace(/\./g, "").replace(",", ".")); return isNaN(v) ? 0 : v; };
const r2 = (v) => Math.round(v * 100) / 100;
const addDays = (d, n) => { const t = new Date(d + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

export function decodeText(buf) {
  let t = new TextDecoder("utf-8").decode(buf);
  if (t.includes("\uFFFD")) t = new TextDecoder("windows-1252").decode(buf);
  return t.replace(/^\uFEFF/, "");
}
function splitCsv(line, sep) {
  const r = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) { const c = line[i];
    if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; continue; } q = !q; continue; }
    if (c === sep && !q) { r.push(cur); cur = ""; continue; } cur += c; }
  r.push(cur); return r.map((x) => x.trim());
}
const row = (o) => ({ parc: "", venc: "", fin: "", bcat: "", tipo: "mov", ...o });

/* ---------------- Sicredi ---------------- */
const ofxDate = (s) => (s ? s.slice(0, 4) + "-" + s.slice(4, 6) + "-" + s.slice(6, 8) : "");
const tag = (b, t) => { const m = b.match(new RegExp("<" + t + ">([^<\\r\\n]*)", "i")); return m ? m[1].trim() : ""; };
export function sicrediOFX(t, arquivo) {
  const rows = []; const re = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi; let m;
  while ((m = re.exec(t))) { const b = m[1]; const v = parseFloat(tag(b, "TRNAMT")); const raw = tag(b, "MEMO") || tag(b, "NAME");
    rows.push(row({ id: "C" + (tag(b, "FITID") || tag(b, "DTPOSTED") + raw + v), conta: "sicredi-cc", tit: "Silvano", d: ofxDate(tag(b, "DTPOSTED")), v, raw, arquivo })); }
  const ini = ofxDate(tag(t, "DTSTART")), fim = ofxDate(tag(t, "DTEND")); const bl = t.match(/<LEDGERBAL>([\s\S]*?)<\/LEDGERBAL>/i);
  const saldos = {};
  if (bl) { let asof = ofxDate(tag(bl[1], "DTASOF")); const sv = ofxDate(tag(t, "DTSERVER")); if (sv && (!asof || sv < asof)) asof = sv;
    saldos["sicredi-cc"] = { [ini.slice(0, 7)]: [parseFloat(tag(bl[1], "BALAMT")), asof] }; }
  return { rows, saldos, info: { arquivo, conta: "sicredi-cc", tipo: "Extrato Sicredi (OFX)", periodo: [ini, fim], lancamentos: rows.length, validado: null } };
}
export function sicrediCSV(t, arquivo) {
  const L = t.split(/\r?\n/); let venc = "", hdr = -1, owner = ""; const rows = []; const seen = {};
  for (let i = 0; i < L.length; i++) { const c = splitCsv(L[i], ";");
    if (hdr < 0) { if (/^Data$/i.test(c[0])) { hdr = i; continue; }
      if (/vencimento/i.test(c[0]) && c[1]) { const p = c[1].split("/"); venc = p[2] + "-" + p[1] + "-" + p[0]; }
      if (/associado/i.test(c[0])) owner = c[1] || ""; continue; }
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(c[0])) continue;
    const p = c[0].split("/"), d0 = p[2] + "-" + p[1] + "-" + p[0], raw = (c[1] || "").trim(), v = -num(c[3]), parc = (c[2] || "").replace(/[()]/g, "");
    if (/^Pag Fat/i.test(raw)) continue;
    const nome = c[6] || ""; const base = venc + "|" + d0 + "|" + raw + "|" + v + "|" + parc; seen[base] = (seen[base] || 0) + 1;
    const adic = nome && owner && nome.split(" ")[0] !== owner.split(" ")[0];
    rows.push(row({ id: "K" + base + "|" + seen[base], conta: "sicredi-cartao", tit: adic ? nome.split(" ")[0] : "Silvano", d: parc && venc ? addDays(venc, -10) : d0, v, raw, parc, venc, fin: c[5] || "", arquivo })); }
  if (hdr < 0) throw new Error("não encontrei a tabela de lançamentos da fatura");
  return { rows, saldos: {}, info: { arquivo, conta: "sicredi-cartao", tipo: "Fatura Sicredi (CSV)", periodo: [venc, venc], lancamentos: rows.length, validado: null } };
}

/* ---------------- PDF: reconstrução de linhas a partir das posições do texto ---------------- */
async function pdfPages(buf) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) { const p = await doc.getPage(i); const tc = await p.getTextContent();
    pages.push(tc.items.filter((it) => it.str && it.str.trim()).map((it) => ({ s: it.str, x: it.transform[4], y: it.transform[5], w: it.width }))); }
  await doc.destroy(); return pages;
}
function toLines(items, x0 = 0, x1 = 1e9) {
  const its = items.filter((i) => i.x >= x0 && i.x < x1).sort((a, b) => b.y - a.y || a.x - b.x); const rows = [];
  for (const it of its) { const r = rows.find((r) => Math.abs(r.y - it.y) <= 2.5); if (r) r.items.push(it); else rows.push({ y: it.y, items: [it] }); }
  rows.sort((a, b) => b.y - a.y);
  return rows.map((r) => { r.items.sort((a, b) => a.x - b.x); let s = r.items[0].s;
    for (let k = 1; k < r.items.length; k++) { const a = r.items[k - 1], b = r.items[k]; const gap = b.x - (a.x + a.w); s += (gap > 6 ? "   " : gap < 0.8 ? "" : " ") + b.s; }
    return s.replace(/\s+/g, (m) => (m.length >= 3 ? "   " : " ")).trim(); });
}

/* ---------------- Itaú: extrato da conta ---------------- */
function itauExtrato(pages, arquivo) {
  const lines = pages.flatMap((p) => toLines(p)); const t = lines.join("\n");
  const per = t.match(/período de visualização:\s*(\d\d)\/(\d\d)\/(\d{4})\s+até\s+(\d\d)\/(\d\d)\/(\d{4})/);
  if (!per) throw new Error("extrato do Itaú sem período de visualização");
  const ini = `${per[3]}-${per[2]}-${per[1]}`, fim = `${per[6]}-${per[5]}-${per[4]}`;
  const sal = t.match(/saldo em conta[\s\S]*?R\$\s*(-?[\d.]+,\d\d)/); const emi = t.match(/emitido em:\s*(\d\d)\/(\d\d)\/(\d{4})/);
  const occ = {}, rows = [], sd = [], saldos = { "itau-cc": {} };
  for (const l of lines) {
    const m = l.match(/^(\d\d)\/(\d\d)\/(\d{4})\s+(.+?)\s{2,}(-?[\d.]+,\d\d)$/); if (!m) continue;
    const d = `${m[3]}-${m[2]}-${m[1]}`, desc = m[4].replace(/\s+/g, " ").trim(), v = num(m[5]);
    if (desc.startsWith("SALDO DO DIA")) { sd.push([d, v]); const mo = d.slice(0, 7); if (!saldos["itau-cc"][mo] || d >= saldos["itau-cc"][mo][1]) saldos["itau-cc"][mo] = [v, d]; continue; }
    if (d < ini || d > fim) continue;
    const k = [d, desc, v].join("|"); occ[k] = (occ[k] || 0) + 1;
    const tipo = /JUROS|IOF|MULTA/.test(desc) ? "encargo" : /RECLASSIF/.test(desc) ? "divida" : "mov";
    rows.push(row({ id: "I" + hid(d, desc, pyf(v), occ[k]), conta: "itau-cc", tit: "Silvano", d, v, raw: desc, tipo, arquivo })); }
  let validado = null;
  const dentro = sd.filter((x) => x[0] >= ini && x[0] <= fim), antes = sd.filter((x) => x[0] < ini);
  if (rows.length && dentro.length && antes.length) {
    const ult = rows.reduce((a, r) => (r.d > a ? r.d : a), ""); const soma = rows.reduce((a, r) => a + r.v, 0);
    const fimv = dentro.filter((x) => x[0] <= ult).sort((a, b) => (a[0] < b[0] ? -1 : 1)).pop(); const antv = antes.sort((a, b) => (a[0] < b[0] ? -1 : 1)).pop();
    if (fimv && antv) validado = Math.abs(antv[1] + soma - fimv[1]) < 0.02; }
  return { rows, saldos, info: { arquivo, conta: "itau-cc", tipo: "Extrato Itaú (PDF)", periodo: [ini, fim], lancamentos: rows.length, validado,
    saldo_cabecalho: sal ? num(sal[1]) : null, saldo_cabecalho_data: emi ? `${emi[3]}-${emi[2]}-${emi[1]}` : "" } };
}

/* ---------------- Itaú: fatura do cartão ---------------- */
function itauFatura(pages, arquivo) {
  const full = pages.flatMap((p) => toLines(p)).join("\n");
  const g = (rx) => full.match(rx);
  const vm_ = g(/Vencimento:?\s*(\d\d)\/(\d\d)\/(\d{4})/); if (!vm_) throw new Error("fatura do Itaú sem vencimento");
  const [, vd, vmS, vyS] = vm_; const vy = +vyS, vm = +vmS;
  const total = num((g(/Total desta fatura\s+([\d.]+,\d\d)/) || [])[1]);
  const Lm = g(/Total dos lançamentos atuais\s+([\d.]+,\d\d)/); if (!Lm) throw new Error("fatura do Itaú sem o total dos lançamentos atuais");
  const L = num(Lm[1]);
  const e = g(/Total de encargos em R\$\s+([\d.]+,\d\d)/); const enc = e ? num(e[1]) : 0;
  const a = g(/Total da fatura anterior\s+([\d.]+,\d\d)/); const ant = a ? num(a[1]) : 0;
  const pg = g(/Pagamento efetuado em (\d\d\/\d\d\/\d{4})\s+-\s*([\d.]+,\d\d)/);
  const fe = g(/Emissão:\s*(\d\d)\/(\d\d)\/(\d{4})/); const fech = fe ? `${fe[3]}-${fe[2]}-${fe[1]}` : `${vy}-${String(vm).padStart(2, "0")}-01`;
  const lines = pages.slice(1).flatMap((p) => [...toLines(p, 0, 360), ...toLines(p, 360)]);
  const tx = []; let sec = null, owner = "", fin = "";
  for (const s0 of lines) { const s = s0.trim();
    if (s.startsWith("Lançamentos: compras e saques")) { sec = "compras"; continue; }
    if (s.startsWith("Lançamentos internacionais")) { sec = "inter"; continue; }
    if (s.startsWith("Lançamentos: produtos e serviços")) { sec = "prod"; continue; }
    if (s.startsWith("Compras parceladas") || s.startsWith("L Total dos lançamentos") || s.startsWith("Simulação")) { sec = null; continue; }
    if (!sec) continue;
    let m = s.match(/^(.+?) \(final (\d{4})\)$/); if (m) { owner = m[1]; fin = m[2]; continue; }
    if (/^Lançamentos no cartão/.test(s)) continue;
    m = s.match(/^Repasse de IOF em R\$\s+([\d.]+,\d\d)/); if (m) { tx.push({ dm: null, desc: "IOF compras internacionais", v: num(m[1]), parc: "", cat: "", own: owner, fin, sec: "inter" }); continue; }
    m = s.match(/^(\d\d)\/(\d\d)\s+(.+?)\s{3}(-?[\d.]+,\d\d)(?:\s{3}\S.*)?$/);
    if (m) { let desc = m[3].trim(), parc = ""; const pm = desc.match(/\s*(\d\d)\/(\d\d)$/);
      if (pm && sec === "compras") { parc = pm[1] + "/" + pm[2]; desc = desc.slice(0, pm.index).trim(); }
      tx.push({ dm: [+m[1], +m[2]], desc, v: num(m[4]), parc, cat: "", own: sec !== "prod" ? owner : "", fin: sec !== "prod" ? fin : "", sec }); continue; }
    m = s.match(/^([A-ZÀ-Ü][A-ZÀ-Ü ]+?)\s?\.(\S.*)$/);
    if (m && tx.length && !tx[tx.length - 1].cat && tx[tx.length - 1].sec === "compras") tx[tx.length - 1].cat = m[1].trim(); }
  const venc = `${vy}-${String(vm).padStart(2, "0")}-${vd}`; const rows = [];
  tx.forEach((t, i) => { const date = !t.dm ? fech : `${t.dm[1] <= vm ? vy : vy - 1}-${String(t.dm[1]).padStart(2, "0")}-${String(t.dm[0]).padStart(2, "0")}`;
    const tit = /^GISE/i.test(t.own) ? "Gisele" : "Silvano";
    rows.push(row({ id: "F" + hid(venc, date, t.desc, pyf(t.v), t.parc, t.fin, i), conta: "itau-cartao", tit, d: t.parc ? fech : date, v: -t.v, raw: t.desc, bcat: t.cat, fin: t.fin, parc: t.parc, venc,
      tipo: t.sec === "prod" || t.desc.startsWith("IOF") ? "encargo" : "mov", arquivo })); });
  if (enc > 0) rows.push(row({ id: "F" + hid(venc, "encargos"), conta: "itau-cartao", tit: "Silvano", d: fech, v: -enc, raw: "Encargos da fatura (juros do rotativo, mora, multa, IOF)", venc, tipo: "encargo", arquivo }));
  const soma = r2(tx.reduce((a, t) => a + t.v, 0)); const ok = Math.abs(soma - L) < 0.02;
  const avisos = ok ? [] : [`${arquivo}: soma dos lançamentos ${soma.toFixed(2)} difere do total impresso ${L.toFixed(2)}`];
  return { rows, saldos: {}, avisos, fatura: { conta: "itau-cartao", vencimento: venc, fechamento: fech, total, lancamentos: L, encargos: enc, anterior: ant, pago: pg ? num(pg[2]) : 0, validado: ok, arquivo },
    info: { arquivo, conta: "itau-cartao", tipo: "Fatura Itaú (PDF)", periodo: [venc, venc], lancamentos: tx.length, validado: ok } };
}

/* ---------------- C6: planilha do extrato ---------------- */
async function c6Xlsx(buf, arquivo) {
  const ExcelJS = (await import("exceljs")).default; const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf);
  const ws = wb.worksheets[0]; const rs = [];
  ws.eachRow((r, i) => { if (i < 10) return; const v = r.values; const dl = v[1], dc = v[2];
    if (!(dl instanceof Date)) return; rs.push({ dl, dc: dc instanceof Date ? dc : dl, tit: String(v[3] ?? "").trim(), det: String(v[4] ?? "").trim(), ent: +v[5] || 0, sai: +v[6] || 0, saldo: v[7] == null || v[7] === "" ? null : +v[7] }); });
  if (!rs.length) throw new Error("planilha do C6 sem lançamentos");
  const iso = (dt) => dt.toISOString().slice(0, 10); const occ = {}, rows = [], saldos = { "c6-cc": {} }; let ini = null, fim = null;
  for (const r of rs) { const d = iso(r.dl); const v = r2(r.ent - r.sai);
    let desc = /^(Pix|Recorr|Devol|Transf)/i.test(r.tit) ? r.tit : /^(DEBITO DE CARTAO|EST DEBITO)/i.test(r.tit) ? r.det : r.tit + (r.det && r.det.toUpperCase() !== r.tit.toUpperCase() ? " · " + r.det : "");
    desc = desc.replace(/\s+/g, " ").trim();
    const tipo = /PGTO FAT/i.test(r.tit) ? "pgto_fatura" : /CDB|TESOURO/i.test(r.tit) ? "investimento" : "mov";
    const k = [d, desc, v].join("|"); occ[k] = (occ[k] || 0) + 1;
    rows.push(row({ id: "S" + hid(d, desc, v, occ[k]), conta: "c6-cc", tit: "Gisele", d, v, raw: desc, bcat: r.tit, tipo, arquivo }));
    ini = !ini || d < ini ? d : ini; fim = !fim || d > fim ? d : fim; if (r.saldo != null) saldos["c6-cc"][d.slice(0, 7)] = [r.saldo, d]; }
  // conferência: saldo do dia (data contábil) x soma dos lançamentos
  const byDay = []; for (const r of rs) { const k = iso(r.dc); const last = byDay[byDay.length - 1]; if (last && last.k === k) last.g.push(r); else byDay.push({ k, g: [r] }); }
  const f0 = byDay[0].g; let bal = r2(f0[f0.length - 1].saldo - f0.reduce((a, r) => a + r.ent - r.sai, 0)); const ini_saldo = bal; const difs = [];
  for (const { k, g } of byDay) { bal += g.reduce((a, r) => a + r.ent - r.sai, 0); const s = g[g.length - 1].saldo;
    if (s != null && Math.abs(bal - s) > 0.01) { difs.push([k, r2(s - bal)]); bal = s; } }
  const avisos = difs.map(([d, v]) => `C6: em ${d.slice(8)}/${d.slice(5, 7)} o saldo do banco difere em R$ ${v.toFixed(2)} da soma dos lançamentos (movimento ausente no extrato exportado)`);
  return { rows, saldos, avisos, info: { arquivo, conta: "c6-cc", tipo: "Extrato C6 (planilha)", periodo: [ini, fim], lancamentos: rows.length, validado: difs.length === 0, saldo_inicial: ini_saldo, diferencas: difs } };
}

/* ---------------- Lançamentos manuais (transcritos) ---------------- */
function manual(t, arquivo) {
  const L = t.split(/\r?\n/); const meta = {};
  for (const l of L) if (l.startsWith("#saldo_")) { const [k, v, d] = l.slice(1).split(";"); meta[k] = [parseFloat(v), d]; }
  const body = L.filter((l) => l.trim() && !l.startsWith("#")); const hdr = body[0].split(";"); const occ = {}, rows = []; let soma = 0; const contas = new Set(), datas = [];
  for (const l of body.slice(1)) { const c = Object.fromEntries(hdr.map((h, i) => [h, (l.split(";")[i] || "").trim()])); const v = parseFloat(c.valor), d = c.data, desc = c.descricao;
    const k = [c.conta, d, desc, v].join("|"); occ[k] = (occ[k] || 0) + 1;
    rows.push(row({ id: "M" + hid(c.conta, d, desc, pyf(v), occ[k]), conta: c.conta, tit: c.titular || "Silvano", d, v, raw: desc, tipo: /JUROS|IOF|MULTA/.test(desc) ? "encargo" : "mov", arquivo }));
    soma += v; contas.add(c.conta); datas.push(d); }
  const ok = meta.saldo_inicial && meta.saldo_final ? Math.abs(meta.saldo_inicial[0] + soma - meta.saldo_final[0]) < 0.02 : null;
  const per = [meta.saldo_inicial ? addDays(meta.saldo_inicial[1], 1) : datas.sort()[0], meta.saldo_final ? meta.saldo_final[1] : datas.sort().pop()];
  return { rows, saldos: {}, avisos: ok === false ? [`${arquivo}: lançamentos manuais não fecham com os saldos informados`] : [], info: { arquivo, conta: [...contas][0] || "", tipo: "Lançamentos manuais", periodo: per, lancamentos: rows.length, validado: ok } };
}

/* ---------------- Identificação do tipo de arquivo ---------------- */
export async function parseFile(buf, arquivo) {
  const low = arquivo.toLowerCase();
  if (low.endsWith(".ofx")) return sicrediOFX(decodeText(buf), arquivo);
  if (low.endsWith(".csv")) { const t = decodeText(buf);
    if (/^#|^conta;titular;data;descricao;valor/m.test(t.slice(0, 600)) && /conta;titular;data;descricao;valor/.test(t)) return manual(t, arquivo);
    return sicrediCSV(t, arquivo); }
  if (low.endsWith(".xlsx")) return c6Xlsx(buf, arquivo);
  if (low.endsWith(".pdf")) { const pages = await pdfPages(buf); const p1 = (pages[0] || []).map((i) => i.s).join(" ");
    if (/extrato conta/i.test(p1) && /lançamentos/i.test(p1)) return itauExtrato(pages, arquivo);
    if (/Resumo da fatura|Total desta fatura|Lançamentos atuais/i.test(p1)) return itauFatura(pages, arquivo);
    if (/C6|Extrato da conta/i.test(p1)) return { rows: [], saldos: {}, ignorado: true, info: { arquivo, conta: "c6-cc", tipo: "PDF do C6 (use a planilha, que traz os mesmos dados)", ignorado: true } };
    throw new Error("PDF não reconhecido (esperado extrato ou fatura do Itaú)"); }
  throw new Error("formato não suportado (use OFX, CSV, PDF ou XLSX)");
}
