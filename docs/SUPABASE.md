# Apontar para o Supabase

Nenhuma linha de código muda: o Prisma usa o driver adapter `@prisma/adapter-pg` e lê
as duas URLs do ambiente.

## 1. Pegar as connection strings

No painel do Supabase: **Project Settings › Database › Connection string**.

| Variável | Qual string usar | Porta |
| --- | --- | --- |
| `DATABASE_URL` | Transaction pooler (PgBouncer) | 6543 |
| `DIRECT_URL` | Session / Direct connection | 5432 |

```env
DATABASE_URL="postgresql://postgres.<ref>:<senha>@aws-0-<regiao>.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres.<ref>:<senha>@aws-0-<regiao>.pooler.supabase.com:5432/postgres"
```

O pooler em modo transação não executa DDL, por isso as migrations usam `DIRECT_URL`
(configurado em `prisma.config.ts`).

## 2. Aplicar o schema

```bash
npm run db:deploy
```

Para popular o catálogo, os perfis e as etapas do Kanban em um banco novo:

```bash
npm run db:seed
```

Em produção, rode o seed uma vez e troque imediatamente a senha do administrador.

## 3. Voltar para o banco local

Basta reapontar as duas variáveis para `postgresql://postgres@127.0.0.1:55433/gestao_erp`
e rodar `npm run db:start`.

## Observações

- O sistema não usa Row Level Security do Supabase: o acesso é controlado pela
  aplicação, com sessões e permissões próprias. Não exponha a chave `service_role` em
  lugar nenhum.
- Não é necessário usar Supabase Auth nem Supabase Storage. Só o Postgres.
- Em serverless, mantenha `connection_limit=1` na URL do pooler.
