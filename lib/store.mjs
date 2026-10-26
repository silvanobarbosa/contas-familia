// Armazenamento: Vercel Blob privado em produção; pasta local nos testes (LOCAL_STORE=/caminho).
// Todo JSON é lido sem cache e gravado com controle de versão (ETag), para que duas pessoas
// salvando ao mesmo tempo não apaguem o trabalho uma da outra.
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export class Conflito extends Error { constructor() { super("conflito de versão"); this.code = "CONFLITO"; } }

const LOCAL = !process.env.BLOB_READ_WRITE_TOKEN && process.env.LOCAL_STORE;
let _blob; const B = async () => (_blob ??= await import("@vercel/blob"));

async function streamToBuffer(stream) {
  const chunks = []; const reader = stream.getReader();
  for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(Buffer.from(value)); }
  return Buffer.concat(chunks);
}
const lp = (p) => path.join(LOCAL, p);
const etagOf = (buf) => '"' + createHash("md5").update(buf).digest("hex") + '"';

export async function readBuf(p) {
  if (LOCAL) { try { const b = await fs.readFile(lp(p)); return { buf: b, etag: etagOf(b) }; } catch (e) { if (e.code === "ENOENT") return null; throw e; } }
  const blob = await B(); const r = await blob.get(p, { access: "private", useCache: false });
  if (!r || r.statusCode !== 200 || !r.stream) return null;
  return { buf: await streamToBuffer(r.stream), etag: r.blob.etag };
}

export async function readJSON(p) { const r = await readBuf(p); return r ? { data: JSON.parse(r.buf.toString("utf8")), etag: r.etag } : null; }

/** Grava. etag: undefined = sobrescreve sempre; null = só cria se não existir; "<etag>" = só se não mudou. */
export async function write(p, body, { etag, contentType = "application/json" } = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
  if (LOCAL) {
    const cur = await readBuf(p);
    if (etag === null && cur) throw new Conflito();
    if (etag && (!cur || cur.etag !== etag)) throw new Conflito();
    await fs.mkdir(path.dirname(lp(p)), { recursive: true }); await fs.writeFile(lp(p), buf); return etagOf(buf);
  }
  const blob = await B();
  const opts = { access: "private", contentType, addRandomSuffix: false, allowOverwrite: etag !== null, cacheControlMaxAge: 60 };
  if (etag) opts.ifMatch = etag;
  try { const r = await blob.put(p, buf, opts); return r.etag; }
  catch (e) {
    if (e instanceof blob.BlobPreconditionFailedError || (etag === null && /already exists/i.test(String(e.message)))) throw new Conflito();
    throw e;
  }
}

export async function remove(p) {
  if (LOCAL) { await fs.rm(lp(p), { force: true }); return; }
  const blob = await B(); await blob.del(p);
}

/** Lê, altera e grava um JSON com repetição automática em caso de conflito. */
export async function update(p, fn, inicial) {
  for (let i = 0; i < 5; i++) {
    const cur = await readJSON(p);
    const data = cur ? cur.data : structuredClone(inicial);
    const next = await fn(data);
    try { const etag = await write(p, next, { etag: cur ? cur.etag : null }); return { data: next, etag }; }
    catch (e) { if (e.code !== "CONFLITO") throw e; await new Promise((r) => setTimeout(r, 150 * (i + 1))); }
  }
  throw new Error("muitas gravações simultâneas, tente de novo");
}
