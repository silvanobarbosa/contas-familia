// Chave das sessões: AUTH_SECRET, se existir; senão uma chave aleatória criada no primeiro uso
// e guardada no armazenamento privado. Assim ninguém precisa criar nem copiar segredo algum.
import { randomBytes } from "node:crypto";
import { readJSON, write } from "./store.mjs";

const PATH = "sistema/chave-sessao.json";
let cache;
export async function sessionKey() {
  if (cache) return cache;
  const s = process.env.AUTH_SECRET;
  if (s && s.length >= 32) return (cache = new TextEncoder().encode(s));
  let r = await readJSON(PATH);
  if (!r) {
    try { await write(PATH, { k: randomBytes(48).toString("base64") }, { etag: null }); }
    catch (e) { if (e.code !== "CONFLITO") throw e; } // outra instância criou ao mesmo tempo
    r = await readJSON(PATH);
  }
  return (cache = Buffer.from(r.data.k, "base64"));
}
