# Quanto custa manter o sistema no ar

Levantamento de 04/11/2026, com a arquitetura real de produção. Preços de lista
das páginas oficiais. Câmbio usado: **R$ 5,30 por dólar**, mais ~3,5% de IOF de
compra internacional. A parte em dólar oscila; a premissa é essa.

---

## A arquitetura

Três peças, cada uma fazendo o que sabe fazer:

| Peça | Onde | O que roda |
|---|---|---|
| ERP + CRM | **Vercel** | a aplicação Next.js |
| Banco do ERP | **Supabase** | Postgres gerenciado |
| Automação | **VPS Hostinger** | Evolution API, n8n, e o Postgres e Redis **deles** |

O ERP e a automação conversam **pela API REST**, não pelo banco. Isso já era a
regra do projeto: o Leona Flow não toca no Postgres do ERP, porque senão as
regras de negócio passariam a existir em dois lugares e um dia divergiriam.

**Consequência prática para o custo:** o VPS **não** usa o Supabase. Evolution e
n8n sobem o Postgres e o Redis deles na própria máquina. São dados de outra
natureza — sessão de WhatsApp, histórico de execução de workflow — e são
falantes demais para dividir conexão e egress com o ERP.

---

## Dimensionando o VPS

Essa é a parte que muda em relação ao cálculo anterior. O VPS não vai rodar o
ERP — vai rodar a automação, que é **mais pesada** que o ERP.

| Serviço | RAM na prática |
|---|---|
| n8n | 2 GB para subir, **4 GB** para produção |
| Evolution API | ~2 GB para algumas instâncias Baileys |
| Postgres (dos dois) | ~1 GB |
| Redis | ~0,3 GB |
| Docker, proxy reverso, sistema | ~0,8 GB |
| **Soma** | **~8 GB** |

Duas armadilhas conhecidas desse stack:

- **n8n guarda o dataset inteiro do workflow em memória**, como objeto JS. O nó
  Code é a causa mais comum de instância de n8n morrendo por falta de memória.
  Memória importa mais que CPU aqui.
- **Evolution API guarda mídia** — áudio, imagem, documento que o cliente manda
  no WhatsApp. Se persistir tudo no Postgres, o disco cresce rápido e sem aviso.
  Configure para não persistir mídia, ou mande para storage externo, ou tenha
  expurgo.

### Qual plano

| Plano | Especificação | Promo (24m) | Renovação | Veredito |
|---|---|---|---|---|
| KVM 1 | 1 vCPU, 4 GB, 50 GB | R$ 29,99 | R$ 59,99 | **não** — n8n sozinho já come isso |
| KVM 2 | 2 vCPU, 8 GB, 100 GB | R$ 42,99 | R$ 77,99 | **piso.** Funciona com automação enxuta |
| KVM 4 | 4 vCPU, 16 GB, 200 GB | R$ 59,99 | R$ 149,99 | **recomendado.** Folga de verdade |

A diferença entre KVM 2 e KVM 4 **na promoção** é R$ 17/mês. Considerando que a
automação é quem atende o cliente final — se ela cai, o atendimento para —, R$ 17
é barato por não precisar pensar no assunto. Na renovação a diferença sobe para
R$ 72/mês, e aí vale reavaliar com o consumo real medido.

Escolha o data center em **São Paulo**. A troca de localização é gratuita pelo
hPanel, e é onde estão os usuários do WhatsApp.

---

## A conta

### Com KVM 4 (recomendado)

| Item | Promo | Renovação |
|---|---|---|
| Vercel Pro (US$ 20) | R$ 109,70 | R$ 109,70 |
| Supabase Pro (US$ 25) | R$ 137,14 | R$ 137,14 |
| Hostinger KVM 4 | R$ 59,99 | R$ 149,99 |
| **Total/mês** | **R$ 306,83** | **R$ 396,83** |
| **Total/ano** | **R$ 3.682** | **R$ 4.762** |

### Com KVM 2 (piso)

| Item | Promo | Renovação |
|---|---|---|
| Vercel Pro | R$ 109,70 | R$ 109,70 |
| Supabase Pro | R$ 137,14 | R$ 137,14 |
| Hostinger KVM 2 | R$ 42,99 | R$ 77,99 |
| **Total/mês** | **R$ 289,83** | **R$ 324,83** |
| **Total/ano** | **R$ 3.478** | **R$ 3.898** |

**Desembolso à vista:** o preço promocional da Hostinger exige **24 meses pagos
de uma vez** — R$ 1.439,76 no KVM 4, R$ 1.031,76 no KVM 2. Vercel e Supabase são
mensais, sem compromisso.

---

## Por que Pro nos dois serviços

**Vercel Pro, não Hobby.** O plano Hobby é para uso **não comercial**. Um ERP
operando o negócio de um cliente não cabe ali. Hoje está no Hobby — funciona, mas
é irregular, e é o tipo de coisa que se resolve antes de virar problema.

**Supabase Pro, não Free.** O Free **pausa o projeto após 1 semana sem acesso**,
limita a 500 MB e **não faz backup**. Nenhum dos três é negociável em produção.

---

## O banco do ERP cresce quanto?

28 tabelas. Para ~150 vendas/mês, o núcleo (vendas, parcelas, transações,
documentos, CRM, auditoria) gera ~7.000 linhas/mês — uns 45 MB/ano com índices.

O item fora da curva é `integration_events`, que guarda **payload e resposta em
JSON de cada chamada do Leona Flow**. Com 300 chamadas/dia a ~3 KB, são ~330
MB/ano — mais que todo o resto somado. E com essa arquitetura o Leona vai chamar
bastante.

**Total: 100 a 500 MB/ano.** Os 8 GB inclusos duram anos, e o egress (~10
GB/mês) não chega perto dos 250 GB inclusos. Vale uma rotina de expurgo em
`integration_events` acima de 90 dias — barata de escrever agora, chata com a
tabela grande.

---

## Latência: onde importa e onde não

O banco do ERP está em **us-west-2 (Oregon)** e as funções da Vercel estão em
`pdx1`, mesma região. **O caminho crítico está certo** — cada tela do ERP faz
várias consultas, e elas acontecem em milissegundos.

O VPS no Brasil chamando a API do ERP em Oregon leva ~180 ms por chamada. **Isso
não é problema** — uma conversa de WhatsApp dispara um punhado de chamadas e
nada disso é síncrono na frente do usuário. É latência no lugar onde ela não
dói.

Dito de outro jeito: a arquitetura que você descreveu já resolve sozinha o
problema que eu tinha levantado no cálculo anterior. Não há o que migrar.

---

## Custos que ficam de fora

| Item | Custo | Observação |
|---|---|---|
| Domínio `.com.br` | ~R$ 40/ano | registro.br |
| **OpenAI** | **variável, pode passar a infra** | ver abaixo |
| Mercado Pago | taxa por transação | sai da venda, não é infra |
| Envio de e-mail | R$ 0 hoje | o sistema não envia e-mail |

### Sobre a OpenAI

No ERP a IA é acessório. **Na automação ela é o produto** — é o que responde o
cliente no WhatsApp. O custo sai do lugar de "opcional" e vira linha fixa.

A ordem de grandeza depende de duas coisas: volume de conversa e modelo
escolhido. Para 1.000 conversas/mês de ~10 mensagens, com um modelo pequeno, o
gasto fica na casa de **US$ 10–20/mês**. Com um modelo de ponta no mesmo volume,
pode passar **US$ 150/mês** — mais que todo o resto da infraestrutura somado.

Isso precisa ser decidido olhando o modelo e o volume, não chutando. Quando
vocês fecharem qual modelo o Leona vai usar, dá para calcular de verdade.

---

## Resumo em uma linha

**R$ 290 a R$ 307/mês no primeiro ano** (~R$ 3.500 a R$ 3.700), subindo para
**R$ 325 a R$ 397/mês** quando a promoção da Hostinger vencer — mais o que a
OpenAI consumir, que é a única variável que pode virar a maior da lista.
