// Envio do e-mail de redefinição de senha pelo Gmail (senha de app em GMAIL_APP_PASSWORD).
export const emailConfigurado = () => Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);

export async function enviarReset({ para, nome, link }) {
  if (!emailConfigurado()) throw new Error("envio de e-mail não configurado");
  const nodemailer = (await import("nodemailer")).default;
  const t = nodemailer.createTransport({ service: "gmail", auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD } });
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  await t.sendMail({
    from: `"Contas da Família" <${process.env.GMAIL_USER}>`, to: para,
    subject: "Redefinir sua senha — Contas da Família",
    text: `Olá, ${nome}.\n\nPara criar uma nova senha, abra o link abaixo (vale por 30 minutos):\n${link}\n\nSe você não pediu isso, ignore este e-mail; sua senha atual continua valendo.`,
    html: `<p>Olá, ${esc(nome)}.</p><p>Para criar uma nova senha, use o botão abaixo. O link vale por 30 minutos.</p><p><a href="${esc(link)}" style="display:inline-block;background:#1f5e4b;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Criar nova senha</a></p><p style="color:#666">Se você não pediu isso, ignore este e-mail; sua senha atual continua valendo.</p>`,
  });
}
