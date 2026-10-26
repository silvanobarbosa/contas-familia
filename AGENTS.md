# AGENTS.md — Contas Família

Regras deste repo para qualquer coding agent (Claude, Cursor, Codex) que edite/revise.
Padrão da casa: `C:\Users\User\ReverbLabs\AGENTS.md`. Aqui, as especificidades do app.

## O que é
App familiar privado de contas: importa extratos/planilhas, classifica lançamentos, consolida.
**Next 16 App Router SEM React** — as páginas são HTML inline geradas de `ui/*.html` por
`scripts/gen-ui.mjs` (build: `unpack → gen → next build`). Middleware = `proxy.js` (não `middleware.ts`).

## Contas (sempre estas)
- Vercel/GitHub = `silvanobarbosa@gmail.com`. Repo `silvanobarbosa/contas-familia`.
- **NUNCA** vincular nada ao `renan@rdmss.com.br` (é só login do Claude).
- Autor de commit **tem** que ser `silvanobarbosa@gmail.com` (senão a Vercel bloqueia produção).

## Armazenamento
- **Vercel Blob privado** (store `contas-familia-blob`), **não** Postgres. Acesso via OIDC em runtime.
- `lib/store.mjs`: `readJSON/write/update/remove`, com ETag (otimista) e modo `LOCAL_STORE` (testes).
- Os dados da família vivem no Blob (`sistema/usuarios.json`, `dados/*`, uploads). **Nunca apagar** o
  store sem saber o que tem — são dados reais.

## Auth (próprio, não auth-kit)
- `lib/auth.mjs`: bcrypt 12, lockout (5 falhas → 15min), **anti-enumeração** (mesma msg p/ user
  inexistente e senha errada), reset por token SHA-256 (30min). JWT de sessão (`jose`, HS256, 30d).
- `getUsers()` lê o Blob **antes** do `SEED_USERS`. SEED_USERS só semeia num store vazio.
- Toda rota de dados confere a sessão (`sessao(req)` em `lib/http.mjs`), e `proxy.js` barra quem não
  tem cookie. Páginas/rotas públicas entram no `LIVRES` do `proxy.js`.

## Não-negociáveis (reprovar PR se violar)
- Segredo só em env (`.gitignore` cobre `.env*`); nunca em log/código.
- Validação de input em todo boundary de API (body via `req.json().catch`).
- Checagem de origem em métodos não-GET (já no `proxy.js`).
- 6 security headers no `next.config.mjs`: CSP, X-Frame, X-Content-Type, Referrer, Permissions, HSTS.
- `next` sempre em linha com patch de segurança (RCE SVG exigiu ≥16.4.2).
- `npm audit --audit-level=high` limpo (override de transitivas quando não há fix upstream direto).
- `/api/health` e `/api/conformity` sempre no ar (monitor/drift-check da frota).

## Testes
- Vitest (`npm test`). Lógica pura em `lib/`. Store de teste = `LOCAL_STORE` (pasta temp).
  Lembrar: `store.mjs` fixa `LOCAL` no import — limpe o arquivo entre testes, não troque o env.
