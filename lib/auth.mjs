// Usuários, sessões e redefinição de senha.
// As senhas ficam só como hash bcrypt; o link de redefinição fica só como hash SHA-256 e expira em 30 minutos.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { readJSON, update } from "./store.mjs";
import { sessionKey } from "./secret.mjs";
import seedUsers from "../seed/usuarios.json" with { type: "json" };

const USERS = "sistema/usuarios.json";
export const COOKIE = "sessao";
const DIAS = 30, MAX_FALHAS = 5, BLOQUEIO_MIN = 15;
const secret = sessionKey;
const sha = (s) => createHash("sha256").update(s).digest("hex");
const pv = (u) => sha(u.hash).slice(0, 12); // muda quando a senha muda e derruba as sessões antigas

function seed() {
  // SEED_USERS: [{"login":"silvano","nome":"Silvano","email":"...","hash":"$2b$..."}]
  // usado só no primeiro acesso; depois os usuários ficam no armazenamento privado
  const list = process.env.SEED_USERS ? JSON.parse(process.env.SEED_USERS) : seedUsers;
  return { users: list.map((u) => ({ login: u.login, nome: u.nome, email: u.email || "", hash: u.hash, falhas: 0, bloqueadoAte: 0 })) };
}
export async function getUsers() { const r = await readJSON(USERS); return r ? r.data : seed(); }
export async function updateUsers(fn) { return (await update(USERS, fn, seed())).data; }
export const publico = (u) => ({ login: u.login, nome: u.nome, email: u.email || "" });
/** Reset de bootstrap: sobrescreve usuarios.json com o SEED_USERS atual (gated por segredo na rota). */
export async function reseed() { return updateUsers(() => seed()); }
export const validaSenha = (s) => (typeof s === "string" && s.length >= 8 && s.length <= 128 ? null : "A senha precisa ter de 8 a 128 caracteres.");

export async function login(loginRaw, senha) {
  const login = String(loginRaw || "").trim().toLowerCase();
  const db = await getUsers(); const u = db.users.find((x) => x.login === login);
  if (!u) { await bcrypt.compare(String(senha || ""), "$2b$12$6BVzNMGrAtCpwCyyhbv4auOeAizwEUADa/WHb3dFBf8OzoBfE38Ye"); return { erro: "Usuário ou senha incorretos." }; }
  if (u.bloqueadoAte > Date.now()) return { erro: `Muitas tentativas erradas. Tente de novo em ${Math.ceil((u.bloqueadoAte - Date.now()) / 60000)} minuto(s) ou use “Esqueci a senha”.` };
  const ok = await bcrypt.compare(String(senha || ""), u.hash);
  await updateUsers((d) => { const x = d.users.find((y) => y.login === login);
    if (ok) { x.falhas = 0; x.bloqueadoAte = 0; x.ultimoAcesso = new Date().toISOString(); }
    else { x.falhas = (x.falhas || 0) + 1; if (x.falhas >= MAX_FALHAS) { x.bloqueadoAte = Date.now() + BLOQUEIO_MIN * 60000; x.falhas = 0; } }
    return d; });
  if (!ok) return { erro: "Usuário ou senha incorretos." };
  const token = await new SignJWT({ pv: pv(u) }).setProtectedHeader({ alg: "HS256" }).setSubject(u.login).setIssuedAt().setExpirationTime(`${DIAS}d`).sign(await secret());
  return { token, user: publico(u) };
}
export const cookieOpts = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: DIAS * 86400 };

export async function verifyToken(token) {
  if (!token) return null;
  try { const { payload } = await jwtVerify(token, await secret(), { algorithms: ["HS256"] }); return payload; } catch { return null; }
}

/** Sessão completa (confere se a senha não mudou depois do login). Use nas rotas de API. */
export async function sessao(req) {
  const p = await verifyToken(req.cookies.get(COOKIE)?.value);
  if (!p) return null;
  const db = await getUsers(); const u = db.users.find((x) => x.login === p.sub);
  if (!u || pv(u) !== p.pv) return null;
  return publico(u);
}

export async function trocarSenha(login, atual, nova) {
  const e = validaSenha(nova); if (e) return { erro: e };
  const db = await getUsers(); const u = db.users.find((x) => x.login === login);
  if (!u || !(await bcrypt.compare(String(atual || ""), u.hash))) return { erro: "A senha atual está incorreta." };
  const hash = await bcrypt.hash(nova, 12);
  await updateUsers((d) => { const x = d.users.find((y) => y.login === login); x.hash = hash; x.reset = null; return d; });
  return { ok: true };
}

export async function criarReset(ident) {
  const k = String(ident || "").trim().toLowerCase();
  const db = await getUsers(); const u = db.users.find((x) => x.login === k || (x.email && x.email.toLowerCase() === k));
  if (!u || !u.email) return null;
  if (u.reset && Date.now() < u.reset.exp - 28 * 60000) return null; // no máximo um e-mail a cada 2 minutos
  const token = randomBytes(32).toString("base64url");
  await updateUsers((d) => { const x = d.users.find((y) => y.login === u.login); x.reset = { h: sha(token), exp: Date.now() + 30 * 60000 }; return d; });
  return { user: u, token };
}

export async function usarReset(login, token, nova) {
  const e = validaSenha(nova); if (e) return { erro: e };
  const db = await getUsers(); const u = db.users.find((x) => x.login === String(login || "").toLowerCase());
  const okTok = u && u.reset && u.reset.exp > Date.now() && token &&
    timingSafeEqual(Buffer.from(u.reset.h), Buffer.from(sha(String(token))));
  if (!okTok) return { erro: "Este link é inválido ou expirou. Peça um novo em “Esqueci a senha”." };
  const hash = await bcrypt.hash(nova, 12);
  await updateUsers((d) => { const x = d.users.find((y) => y.login === u.login); x.hash = hash; x.reset = null; x.falhas = 0; x.bloqueadoAte = 0; return d; });
  return { ok: true };
}

export async function trocarEmail(login, email) {
  const v = String(email || "").trim();
  if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return { erro: "E-mail inválido." };
  await updateUsers((d) => { const x = d.users.find((y) => y.login === login); x.email = v; return d; });
  return { ok: true };
}
