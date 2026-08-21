# Space Adventure

Jogo web mobile-first de reflexos (nave x pedras/moedas/boosts), com identidade própria, React/Vite no frontend e API Express/Prisma no backend. Todos os créditos são fictícios e não possuem valor monetário.

## Requisitos

- Node.js 22 ou superior
- npm 10 ou superior

## Instalação e configuração

Na raiz:

```bash
npm install
npm install --prefix backend
npm install --prefix admin
npm install --prefix space-adventure/frontend
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

O SUPER_ADMIN não possui credenciais fixas no código. Antes do seed, defina `ADMIN_NAME`, `ADMIN_EMAIL` e uma `ADMIN_PASSWORD` com ao menos 12 caracteres no `backend/.env`.

## Desenvolvimento

Inicie os serviços juntos:

```bash
npm run dev
```

Ou em terminais separados:

```bash
npm run dev --prefix backend
npm run dev --prefix admin
npm run dev --prefix space-adventure/frontend
```

- Space Adventure: http://localhost:5175
- Backend: http://localhost:3001
- Admin: http://localhost:5174
- Saúde da API: http://localhost:3001/api/health

## Build e execução de produção

```bash
npm run build
npm run start --prefix backend
npm run preview --prefix space-adventure/frontend -- --host 0.0.0.0 --port 5175
npm run preview --prefix admin
```

## Verificação

```bash
npm run typecheck
curl http://localhost:3001/api/health
```

Fluxo manual recomendado: criar conta, jogar uma rodada, conferir o resultado e o histórico.

## API

| Método | Rota | Autenticação |
|---|---|---|
| POST | `/api/auth/register` | Não |
| POST | `/api/auth/login` | Não |
| GET | `/api/users/me` | JWT |
| GET | `/api/space/config` | Não |
| POST | `/api/space/rounds` | JWT |
| GET | `/api/space/rounds/active` | JWT |
| GET | `/api/space/rounds` | JWT |
| POST | `/api/space/rounds/:id/move` | JWT |
| POST | `/api/space/rounds/:id/event` | JWT |
| POST | `/api/space/rounds/:id/settle` | JWT |
| POST | `/api/space/rounds/:id/abandon` | JWT |

O backend mantém o estado efêmero da partida, gera cada objeto, valida a trajetória da nave e persiste o log de eventos. A pontuação final enviada pelo navegador nunca é aceita como fonte de verdade. Em produção com múltiplas instâncias, substitua o armazenamento efêmero por Redis.
