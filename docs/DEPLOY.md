# Deploy

A aplicação é um Next.js único: frontend, server actions e route handlers no mesmo
projeto. O banco fica em um Postgres gerenciado, fora da Vercel.

## Vercel

1. Importe o repositório.
2. Build command: `npm run build` (já roda `prisma generate`).
3. Configure as variáveis de ambiente. **Só estas cinco** rodam na Vercel:

| Variável | Observação |
| --- | --- |
| `DATABASE_URL` | Pooler do Supabase, porta 6543, com `connection_limit=1` |
| `DIRECT_URL` | Pooler em modo sessão, porta 5432 |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `APP_ENCRYPTION_KEY` | `openssl rand -base64 32`. **Nunca troque depois** sem reconfigurar todas as integrações |
| `APP_URL` | URL pública, usada no OpenAPI e no webhook |

4. Aplique as migrations antes do primeiro acesso. Migrations e seed rodam da sua
   máquina, apontando para o banco de produção — **não** são passos do build:

```bash
npm run db:deploy
```

5. Rode o seed uma única vez para criar perfis, permissões, formas de pagamento,
   categorias, catálogo e etapas do Kanban:

```bash
npm run db:seed
```

   Essas três variáveis pertencem a quem roda o seed, não à Vercel:

| Variável | Observação |
| --- | --- |
| `SEED_ADMIN_EMAIL` | E-mail do primeiro administrador |
| `SEED_ADMIN_PASSWORD` | Senha dele. Obrigatória fora do modo demo — a padrão está publicada no README |
| `SEED_DEMO` | `false` em produção. Impede que os clientes fictícios entrem no banco real |

   Com `NODE_ENV=production` ou `SEED_DEMO=false`, o seed cria **só a estrutura**:
   nenhum cliente fictício, nenhum usuário de exemplo. Ele também recusa rodar sem
   `SEED_ADMIN_PASSWORD`, para o primeiro administrador não nascer com a senha que
   está publicada na documentação.

6. Entre com esse administrador e cadastre os usuários reais em **Usuários**.
7. Com a URL pública em mãos, corrija `APP_URL` e faça um novo deploy. Ela não é
   descoberta em tempo de execução: o que estiver na variável é o que vai para o
   OpenAPI e para a URL do webhook.

## Depois do deploy

Em **Configurações › Integrações**, o administrador configura tudo sem novo deploy:

- gera a API key do Leona Flow e entrega ao time de atendimento;
- informa o Access Token do Mercado Pago e cadastra o webhook
  `{APP_URL}/api/v1/webhooks/mercado-pago`;
- opcionalmente configura OpenAI e n8n.

A aplicação funciona normalmente com qualquer integração opcional desconfigurada.

## Checklist de produção

- [ ] `APP_ENCRYPTION_KEY` guardada fora do repositório e com backup.
- [ ] `SEED_DEMO=false` no ambiente antes de rodar o seed (confira que não há
      clientes fictícios em **Clientes**).
- [ ] `APP_URL` em HTTPS (o cookie de sessão só usa `Secure` em produção).
- [ ] Migrations aplicadas (`npm run db:deploy`).
- [ ] Webhook do Mercado Pago cadastrado com o segredo de assinatura.
- [ ] Backup automático do Postgres habilitado no provedor.

## Antes de entregar ao cliente

Rode o teste de ponta a ponta sugerido: contrato de R$ 5.400, três parcelas, duas
transações recebidas, uma despesa e uma movimentação no Kanban. Esse caminho é coberto
por `tests/integration/finance-flow.test.ts` e pode ser repetido pela interface para
validar a operação real.
