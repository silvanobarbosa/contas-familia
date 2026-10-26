# Contas da Família

Painel privado de finanças da família (Silvano e Gisele): lê os extratos e faturas do Sicredi, Itaú e C6, confere cada arquivo com o saldo do banco quando possível e mostra visão geral, dívidas, categorias, recorrências, projeção e classificação dos lançamentos.

## Como funciona

- **Next.js 16** na Vercel (região `gru1`), sem banco de dados.
- **Vercel Blob privado** guarda tudo:
  - `originais/` — os arquivos enviados, como vieram do banco;
  - `dados/lanc/<sha256>.json` — lançamentos extraídos de cada arquivo;
  - `dados/indice.json` — lista de arquivos (quem enviou, quando, conferência);
  - `dados/base.json` — base consolidada que o painel lê;
  - `dados/ajustes.json` — classificações feitas no painel;
  - `sistema/usuarios.json` — usuários (somente hash bcrypt das senhas).
- Gravações concorrentes usam ETag (`ifMatch`); se os dois salvarem ao mesmo tempo, o painel junta as alterações em vez de sobrescrever.
- Arquivo repetido é reconhecido pelo SHA-256; lançamento repetido entre extratos, pelo identificador.

## Leitores de arquivo (`lib/parsers.mjs`)

| Banco | Arquivo | Conferência |
|---|---|---|
| Sicredi conta | OFX | saldo do mês anterior + lançamentos = saldo do mês |
| Sicredi cartão | CSV da fatura | — |
| Itaú conta | PDF do extrato | "SALDO DO DIA" antes e depois do período |
| Itaú cartão | PDF da fatura | soma = "Total dos lançamentos atuais" |
| C6 conta | planilha XLSX | saldo diário da planilha |
| Manual | CSV `conta;titular;data;descricao;valor` com `#saldo_inicial` / `#saldo_final` | saldos informados |

Os identificadores dos lançamentos são os mesmos do normalizador em Python usado antes, para não perder classificações.

## Segurança

- Login com usuário e senha; senhas só como hash bcrypt (custo 12).
- Sessão em cookie `httpOnly`, `secure`, `SameSite=Lax`, 30 dias; trocar a senha derruba as sessões antigas.
- 5 tentativas erradas bloqueiam o usuário por 15 minutos.
- "Esqueci a senha": link de uso único, válido por 30 minutos, guardado só como hash; no máximo um e-mail a cada 2 minutos.
- Pedidos de alteração vindos de outro site são recusados (checagem de `Origin`).
- Cabeçalhos: `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `noindex`.
- **Nenhum dado bancário vai para este repositório** (ver `.gitignore`).

## Variáveis de ambiente (Vercel → Settings → Environment Variables)

| Variável | Obrigatória | Para quê |
|---|---|---|
| `BLOB_READ_WRITE_TOKEN` | sim | criada ao conectar o Blob ao projeto |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | para "Esqueci a senha" | envio pelo Gmail com senha de app |
| `AUTH_SECRET` | não | se ausente, a chave da sessão é derivada do token do Blob |
| `SEED_USERS` | não | substitui `seed/usuarios.json` no primeiro acesso |

## Rodar localmente

```bash
npm install
LOCAL_STORE=$PWD/.local-store AUTH_SECRET=$(openssl rand -base64 48) npm run dev
```

## Usuários

`seed/usuarios.json` só é usado enquanto `sistema/usuarios.json` não existe no armazenamento. Depois do primeiro acesso, senhas e e-mails mudam pela tela **Minha conta**. Para gerar um hash: `npm run hash`.
