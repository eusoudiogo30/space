# Buraco Doido

Jogo web mobile-first de reflexos, com identidade própria, React/Vite no frontend e API Express/Prisma no backend. Todos os créditos são fictícios e não possuem valor monetário.

## Requisitos

- Node.js 22 ou superior
- npm 10 ou superior

## Instalação e configuração

Na raiz:

```bash
npm install
npm install --prefix frontend
npm install --prefix backend
npm install --prefix admin
cp frontend/.env.example frontend/.env
cp backend/.env.example backend/.env
cp admin/.env.example admin/.env
```

Troque `JWT_SECRET` em `backend/.env` antes de publicar. Para desenvolvimento local, os demais valores já estão prontos.

## Banco, migration e dados de teste

```bash
npm run prisma:generate --prefix backend
npm run prisma:deploy --prefix backend
npm run prisma:seed --prefix backend
```

A migration inicial já está versionada em `backend/prisma/migrations`. Para criar novas migrations durante o desenvolvimento, use `npm run prisma:migrate --prefix backend -- --name nome_da_mudanca`.

Os usuários fictícios usam a senha `jogar123`. Exemplo: `bia@jogo.local`.

O SUPER_ADMIN não possui credenciais fixas no código. Antes do seed, defina `ADMIN_NAME`, `ADMIN_EMAIL` e uma `ADMIN_PASSWORD` com ao menos 12 caracteres no `backend/.env`.

## Desenvolvimento

Inicie os três serviços juntos:

```bash
npm run dev
```

Ou em terminais separados:

```bash
npm run dev --prefix backend
npm run dev --prefix frontend
npm run dev --prefix admin
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3001
- Admin: http://localhost:5174
- Saúde da API: http://localhost:3001/api/health

O jogo também abre em modo convidado se a API estiver indisponível. Login, histórico e ranking persistente precisam do backend.

## Build e execução de produção

```bash
npm run build
npm run start --prefix backend
npm run preview --prefix frontend -- --host 0.0.0.0 --port 5173
npm run preview --prefix admin
```

## Verificação

```bash
npm run typecheck
curl http://localhost:3001/api/health
```

Fluxo manual recomendado: criar conta, jogar por 30 segundos, conferir o resultado, abrir perfil/histórico e conferir os rankings diário e semanal.

## API

| Método | Rota | Autenticação |
|---|---|---|
| POST | `/api/auth/register` | Não |
| POST | `/api/auth/login` | Não |
| GET | `/api/users/me` | JWT |
| POST | `/api/games/start` | JWT |
| POST | `/api/games/event` | JWT |
| POST | `/api/games/finish` | JWT |
| GET | `/api/games/history` | JWT |
| GET | `/api/ranking/daily` | Não |
| GET | `/api/ranking/weekly` | Não |

O backend mantém o estado efêmero da partida, gera cada alvo, valida expiração e sequência, calcula combo/pontos e persiste o log de eventos. A pontuação final enviada pelo navegador nunca é aceita como fonte de verdade. Em produção com múltiplas instâncias, substitua o armazenamento efêmero por Redis.
