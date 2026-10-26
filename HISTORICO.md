# HISTÓRICO — Contas Família

Diário de evolução do produto. Mais recente em cima.

## 2026-10-26 — Resgate e adoção ao padrão da frota

**Entregue:** app reconstruído e funcionando ponta a ponta em produção
(https://contas-familia-ivory.vercel.app). Commits 220d433→0c865be.
- Baseline reconstruído do doc de transferência (feito em outro notebook): 38 arquivos,
  Next 16 App Router **sem React** (páginas HTML inline geradas de `ui/*.html` por
  `scripts/gen-ui.mjs`; `proxy.js` no lugar de middleware). Build validado local + Vercel.
- `/api/health` + `/api/conformity` (monitor sintético da frota + drift-check), públicos no proxy.
- `conformity.json` com `templateVersion: bespoke-1.0.0` — honesto: app **não** nasceu do golden template.
- Testes Vitest (7, passando): `validaSenha`, anti-enumeração do login, `publico` nunca vaza hash.
- `.github/workflows/ci-qa.yml` (molde da casa).
- Content-Security-Policy no `next.config.mjs` (6/6 headers de segurança no ar).
- Next `16.3.8 → 16.4.3`: corrige **RCE crítico via SVG** no Image Optimization (GHSA-2464).
- `override zod ^4.6.6` mata 4 high transitivas do `@vercel/blob` (chain @vercel/oidc→cli-config→zod);
  `@vercel/blob 2.8.2`. `npm audit --audit-level=high` limpo.
- Registrado na frota (monitor/SLO/SAST noturno).

**Por quê:** o app existia na Vercel e no GitHub mas "não funcionava direito". A causa raiz do
login quebrado: o Vercel Blob já tinha `sistema/usuarios.json` de um deploy antigo (senha
desconhecida), então o `SEED_USERS` era **ignorado** — `getUsers()` sempre lê o Blob primeiro.

**Decisões que ficam valendo:**
- **Senha inicial = `ContasFamilia#2026`** para `silvano` e `gisele` (bcrypt 12). Dono/usuários
  devem trocar no primeiro acesso (há "trocar senha" e "esqueci a senha").
- Login é **próprio** (bcrypt + lockout 5 falhas/15min + anti-enumeração + reset SHA-256 30min),
  **não** auth-kit/SSO — é um app familiar privado, não interno da casa. `templateVersion=bespoke`.
- Armazenamento = **Vercel Blob privado** (store `contas-familia-blob`), não Postgres. Os dados da
  família (base de 1168 lançamentos, arquivos, classificações) vivem lá — **preservados** no resgate.
- Reset de usuários feito por rota gated temporária (removida depois) usando o acesso Blob OIDC do
  próprio app — **não** apagar os 46 objetos do Blob (são os dados reais).

**Armadilhas:**
- `getUsers()` lê o Blob **antes** do `SEED_USERS` → setar SEED_USERS num store já populado não
  muda nada. Para rebootstrap: sobrescrever `sistema/usuarios.json`, não só o env.
- `store.mjs` captura `const LOCAL` **no import** — mudar `LOCAL_STORE` em runtime não reconfigura
  (os testes contornam limpando o arquivo no dir fixo).
- `proxy.js` (middleware) bloqueia **toda** rota não listada em `LIVRES` com 401 "Sessão expirada"
  — endpoints públicos (health/conformity/auth) têm que entrar no `LIVRES`.
- Deploy Vercel **não auto-promove**; o `vercel-deploy` da casa já sobe pra produção neste projeto
  (o deploy virou o `current production` sozinho — `promote` deu 409 "already current").

**Pendente:** nenhum bloqueio. Opcional: migrar senhas iniciais para troca forçada no 1º login;
confirmar com o dono os e-mails cadastrados (silvano=silvanobarbosa@gmail.com) para o "esqueci a senha"
(precisa de `GMAIL_USER`/`GMAIL_APP_PASSWORD` no Vercel — hoje ausentes, recurso fica inerte).
