import { criarReset } from "../../../../lib/auth.mjs";
import { enviarReset, emailConfigurado } from "../../../../lib/mail.mjs";
import { json, origemDe } from "../../../../lib/http.mjs";
export const runtime = "nodejs";
const MSG = "Se o usuário ou e-mail estiver cadastrado, enviamos um link para criar uma nova senha. Ele vale por 30 minutos; confira também a caixa de spam.";
export async function POST(req) {
  if (!emailConfigurado()) return json({ erro: "O envio de e-mail ainda não foi configurado. Peça ao Silvano para redefinir a sua senha." }, 503);
  const b = await req.json().catch(() => ({}));
  try {
    const r = await criarReset(b.ident);
    if (r) await enviarReset({ para: r.user.email, nome: r.user.nome, link: `${origemDe(req)}/redefinir?u=${encodeURIComponent(r.user.login)}&t=${r.token}` });
  } catch (e) { console.error("esqueci", e); return json({ erro: "Não consegui enviar o e-mail agora. Tente de novo em alguns minutos." }, 500); }
  return json({ ok: true, mensagem: MSG });
}
