# Deploy na Hostinger

## Uma única aplicação Node.js para tudo

O servidor Express entrega a API (`/api/*`) e os três builds React a partir do **mesmo processo Node** — não há mais um app separado para o admin. No hPanel, crie uma **Node.js Web App** usando a raiz deste repositório.

- Versão do Node.js: `22.x` ou `24.x`
- Comando de build: `npm run build:app`
- Arquivo de entrada: `backend/dist/src/server.js`
- Comando de início, quando o painel solicitar: `npm start`

Rotas servidas:

| Caminho | Aplicação |
| --- | --- |
| `/` | Jogo (Buraco Doido) — `frontend/` |
| `/admin` | Painel administrativo — `admin/` |
| `/space` | Space Adventure — `space-adventure/frontend/` |
| `/api/*` | API (Express) |

Não defina `VITE_API_URL` em produção para nenhum dos três frontends — cada um já tem um `.env.production` com `VITE_API_URL=/api`, então todos usam a API no mesmo domínio automaticamente.

Variáveis mínimas de produção (arquivo `.env` na raiz do repositório, ou configuradas no painel):

```env
NODE_ENV=production
PORT=3001
DATABASE_URL=file:./backend/prisma/production.db
PLAYER_FRONTEND_URL=https://seudominio.com.br
ADMIN_FRONTEND_URL=https://seudominio.com.br
SPACE_FRONTEND_URL=https://seudominio.com.br
JWT_SECRET=gere-um-segredo-longo-e-unico
ADMIN_JWT_SECRET=gere-outro-segredo-longo-e-unico
ADMIN_REFRESH_SECRET=gere-um-terceiro-segredo-longo-e-unico
DATA_ENCRYPTION_SECRET=gere-um-quarto-segredo-longo-e-unico
ADMIN_NAME=Administrador
ADMIN_EMAIL=seu-email-administrativo
ADMIN_PASSWORD=uma-senha-forte-com-mais-de-12-caracteres
```

`PLAYER_FRONTEND_URL`, `ADMIN_FRONTEND_URL` e `SPACE_FRONTEND_URL` alimentam a lista de origens liberadas no CORS. Como agora tudo vive no mesmo domínio, as três podem apontar para a mesma URL — o CORS deixa de ser um fator crítico no dia a dia, mas as variáveis continuam sendo lidas.

O hPanel define a porta usada pela aplicação. O código respeita automaticamente a variável `PORT`.

Antes do primeiro acesso, execute as migrations e o seed no ambiente de publicação:

```bash
npm run prisma:deploy --prefix backend
npm run prisma:seed --prefix backend
```

> O projeto ainda usa SQLite. Para produção real e redeploys seguros, migre para um banco persistente, como MySQL ou PostgreSQL, antes de receber usuários ou pagamentos.

## Como o build funciona

`npm run build:app` (na raiz) faz, em sequência:

1. `prisma generate` no backend
2. `tsc` no backend (gera `backend/dist`)
3. `vite build` no frontend do jogo (gera `frontend/dist`, servido em `/`)
4. `vite build` no admin (gera `admin/dist`, servido em `/admin` — o `base` do Vite já está configurado para `/admin/` no build de produção)
5. `vite build` no Space Adventure (gera `space-adventure/frontend/dist`, servido em `/space` — `base: '/space/'` no build de produção)

O `backend/src/app.ts` procura cada uma dessas pastas `dist` automaticamente (relativo à raiz do processo). Se precisar apontar para um caminho diferente, use as variáveis `FRONTEND_DIST_PATH`, `ADMIN_DIST_PATH` ou `SPACE_DIST_PATH`.

## Verificação

- Jogo: `https://seudominio.com.br/`
- Admin: `https://seudominio.com.br/admin`
- Space Adventure: `https://seudominio.com.br/space`
- Saúde da API: `https://seudominio.com.br/api/health`
