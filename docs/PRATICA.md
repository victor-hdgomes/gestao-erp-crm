# Demandas práticas — você digita, o sistema responde

Doze demandas para rodar **no app, com a mão**. Cada uma traz os dados prontos para
digitar e um bloco **Confira** com o número exato que deve aparecer na tela. Se o
número bater, você entendeu a regra. Se não bater, releia o passo.

Faça na ordem: as demandas 3, 10 e 11 usam clientes criados nas anteriores.

Login: `admin@local.test` / `Admin@123456` · App: http://localhost:3000

> Todos os nomes e CPFs abaixo são inventados. Os CPFs passam no cálculo do dígito
> verificador justamente para você testar a validação, mas não pertencem a ninguém.

**Antes de começar**, anote os números de hoje do Dashboard (*Últimos 30 dias*).
Você vai comparar com eles o tempo todo:

| Indicador | Valor de partida |
|---|---|
| Faturamento contratado | R$ 4.200,00 |
| Recebimentos | R$ 4.408,50 |
| Contas a receber | R$ 9.741,50 (R$ 3.500,00 vencido) |
| Despesas pagas | R$ 2.189,90 |

---

## Demanda 1 — Cliente novo que paga entrada na hora

> **A história:** a Helena fechou hoje um serviço de R$ 1.400. Pagou R$ 500 de
> entrada no Pix, na hora, e o resto fica para daqui a 30 dias.

### Parte A — a venda

**Vendas → Nova venda**

| Campo | Valor |
|---|---|
| Cliente | *Cadastrar novo cliente* → Nome `Helena Martins Dias`, CPF `122.239.920-21`, Telefone `(11) 98123-4455` |
| Data da venda | hoje |
| Adicionar serviço | `Serviço de regularização` (entra com R$ 1.400,00) |

Em **Contrato e parcelas** (já vem ligado — esse serviço exige contrato):

| Campo | Valor |
|---|---|
| Parcelas | `2` |
| Entrada | `500,00` |
| 1º vencimento | **hoje** |
| Intervalo (dias) | `30` |

Clique em **Gerar**. Devem nascer duas linhas: R$ 500,00 vencendo hoje, com a
descrição `Entrada`, e R$ 900,00 vencendo daqui a 30 dias, com a descrição
`Finalização` — o sistema nomeia sozinho. Salve.

### Parte B — o dinheiro

Repare: **a venda não registrou nenhum pagamento.** Ela só disse quanto foi
cobrado. O dinheiro entra separado.

**Transações → Nova transação**, aba **Receita**:

| Campo | Valor |
|---|---|
| Descrição | `Entrada Helena` |
| Cliente | `Helena Martins Dias` |
| Vincular a | o contrato `CTR-...` que acabou de nascer |
| Valor previsto | preenche sozinho com `500,00` |
| Valor recebido | `500,00` |
| Liquidação | hoje |
| Forma de pagamento | `Pix` |

### Confira

- **Financeiro**: a parcela `Entrada` **sumiu da lista** — essa tela só mostra o que
  está em aberto. Ficou a `Finalização`, R$ 900,00, **Pendente**.
- **Vendas**: a venda dela está **Parcialmente paga** — Recebido R$ 500,00,
  Pendente R$ 900,00.
- **CRM / Kanban**: nasceu um card da Helena na primeira etapa,
  *Atualização da Receita Federal*.
- **Dashboard**: contratado subiu R$ 1.400, recebimentos subiram R$ 500 e contas a
  receber subiram R$ 900. **Os três números sobem em valores diferentes** — é esse o
  ponto da demanda.

---

## Demanda 2 — Cliente que só vai pagar no fim

> **A história:** o Igor fechou R$ 3.000 hoje, pediu R$ 200 de desconto e combinou
> pagar tudo de uma vez daqui a 60 dias. Não entrou um centavo.

**Vendas → Nova venda**

| Campo | Valor |
|---|---|
| Cliente | novo: `Igor Bastos Ferraz`, CPF `848.812.735-90`, Telefone `(11) 98777-1020` |
| Adicionar serviço | `Regularização personalizada` |
| Valor unitário | troque R$ 5.400,00 por `3.000,00` |
| Desconto na venda | `200,00` |

Olhe o **Total da venda** no canto direito: caiu para R$ 2.800,00 **antes de salvar**.

> Errou algum valor depois de salvar? Abra a venda e clique em **Editar**. Enquanto
> nada foi recebido, itens, desconto, data e parcelas podem ser reescritos. Depois
> do primeiro recebimento a tela trava e manda estornar antes — o contratado nunca
> pode divergir do que já entrou no caixa.

Contrato: Parcelas `1`, Entrada em branco, 1º vencimento **daqui a 60 dias**.
Gerar, salvar. **Não lance transação nenhuma.**

### Confira

- **Dashboard**: faturamento contratado subiu R$ 2.800 — o desconto entrou como
  faturamento que nunca existiu, não como despesa. **Recebimentos não mudaram.**
  Contas a receber subiram R$ 2.800.
- **Vendas**: status **Aberta**, Recebido R$ 0,00.
- O lucro operacional **não mexeu** — ele é caixa, não promessa.
- Experimente gerar as parcelas *antes* de digitar o desconto: o planejador acusa a
  diferença e não deixa salvar. A soma das parcelas tem que fechar com o total.

---

## Demanda 3 — Pagar só um pedaço da parcela

> **A história:** a Helena ligou dizendo que esse mês só consegue R$ 400 dos R$ 900.

**Transações → Nova transação**, aba **Receita**:

| Campo | Valor |
|---|---|
| Descrição | `Helena — pagamento parcial` |
| Cliente | `Helena Martins Dias` |
| Vincular a | o contrato dela |
| Parcela | a parcela `Finalização` (ou deixe `Automático`) |
| Valor recebido | **apague o valor sugerido e digite** `400,00` |
| Liquidação | hoje |

### Confira

- **Financeiro**: a `Finalização` virou **Parcialmente paga** — previsto R$ 900,00,
  saldo R$ 500,00.
- A parcela **não sumiu** da lista de pendências. Meio pagamento não fecha dívida.
- **Vendas**: Recebido R$ 900,00, Pendente R$ 500,00.

---

## Demanda 4 — Um pagamento que quita duas parcelas e sobra

> **A história:** a Júlia contratou R$ 1.800 em 3 vezes de R$ 600. Mandou um Pix
> único de R$ 1.300.

**Vendas → Nova venda**

| Campo | Valor |
|---|---|
| Cliente | novo: `Júlia Prado Marinho`, CPF `825.575.733-37`, Telefone `(21) 98654-3322` |
| Adicionar serviço | `Serviço de regularização`, valor unitário `1.800,00` |

Contrato: Parcelas `3`, sem entrada, 1º vencimento **daqui a 30 dias**, intervalo `30`.
Gerar → três linhas de R$ 600,00. Salvar.

Depois, **Transações → Nova transação** → Receita:

| Campo | Valor |
|---|---|
| Descrição | `Júlia — Pix único` |
| Cliente | `Júlia Prado Marinho` |
| Vincular a | o contrato dela |
| Parcela | `Automático (mais antiga primeiro)` |
| Valor recebido | `1.300,00` |

### Confira

Abra **Vendas → a venda da Júlia** e olhe a coluna *Transações*:

| Parcela | Previsto | Pago | Status |
|---|---|---|---|
| 1 | R$ 600,00 | R$ 600,00 | Paga |
| 2 | R$ 600,00 | R$ 600,00 | Paga |
| 3 | R$ 600,00 | R$ 100,00 | Parcialmente paga |

**O mesmo código de transação aparece nas três linhas.** Um Pix, três destinos:
é isso que o sistema chama de alocação. O dinheiro vai abatendo da mais antiga
para a mais nova até acabar.

---

## Demanda 5 — Cliente que ficou inadimplente

> **A história:** o Lucas fechou R$ 2.000 em setembro, duas parcelas, e sumiu.

**Vendas → Nova venda**

| Campo | Valor |
|---|---|
| Cliente | novo: `Lucas Andrade Peixoto`, CPF `810.143.873-45`, Telefone `(31) 99212-4488` |
| Data da venda | `03/09/2026` |
| Adicionar serviço | `Serviço de regularização`, valor unitário `2.000,00` |

Contrato: Parcelas `2`, 1º vencimento `03/09/2026`, intervalo `30` →
R$ 1.000,00 em 03/09 e R$ 1.000,00 em 03/10. Salvar. **Nada pago.**

### Confira

- **Financeiro**: as duas parcelas aparecem **Vencidas**, em vermelho.
- **Dashboard**: o aviso de vencido dentro de *Contas a receber* subiu R$ 2.000 —
  era R$ 3.500,00 (só a Carla), agora são R$ 5.500,00.
- **CRM**: o card do Lucas ganhou o marcador de inadimplência. O filtro
  *Só inadimplentes* passa a trazer ele junto com a Carla.
- Repare que **ninguém marcou "vencido" na mão**. A parcela vence sozinha, com a
  passagem do dia. O sistema recalcula o status toda vez que mostra a tela.

---

## Demanda 6 — Consulta avulsa, paga na hora, sem contrato

> **A história:** a Mariana só queria uma consulta de crédito. Pagou R$ 117 no
> cartão e foi embora. Não tem serviço, não tem contrato, não tem acompanhamento.

**Vendas → Nova venda**

| Campo | Valor |
|---|---|
| Cliente | novo: `Mariana Costa Rangel`, CPF `165.017.239-73`, Telefone `(11) 99330-7744` |
| Adicionar serviço | `Consulta de crédito` (R$ 117,00) |
| Contrato e parcelas | **desligue a chave** |

Salve. Depois, **Transações → Nova transação** → Receita:

| Campo | Valor |
|---|---|
| Descrição | `Consulta Mariana` |
| Cliente | `Mariana Costa Rangel` |
| Vincular a | **a venda** `VND-...` (ela aparece na lista junto com os contratos) |
| Valor recebido | preenche sozinho com `117,00` |
| Forma de pagamento | `Cartão de crédito` |

### Confira

- **Vendas**: status **Paga**, Recebido R$ 117,00.
- **CRM**: a Mariana **não tem card**. Consulta não gera acompanhamento — isso é
  configuração do catálogo, visível em **Serviços**, no campo
  *Gerar card no CRM ao vender*.
- **Financeiro**: a Mariana **não aparece**. Sem contrato, não há parcela — o
  recebimento foi direto na venda.

---

## Demanda 7 — Despesa com categoria que ainda não existe

> **A história:** pagou R$ 180 de cartório e não tem categoria para isso.

**Transações → Nova transação**, aba **Despesa**:

| Campo | Valor |
|---|---|
| Descrição | `Reconhecimento de firma` |
| Categoria | clique em **Nova categoria**, escreva `Cartório`, Enter |
| Valor previsto | `180,00` |
| Valor pago | `180,00` |
| Liquidação | hoje |
| Forma de pagamento | `Dinheiro` |

### Confira

- A categoria nasceu **sem você sair do formulário**. Volte em *Nova transação* e
  ela já está na lista.
- **Dashboard**: *Despesas por categoria* ganhou a fatia `Cartório` com R$ 180,00,
  despesas pagas subiram R$ 180 e o **lucro operacional caiu R$ 180**.

---

## Demanda 8 — Lançar errado e consertar do jeito certo

> **A história:** você lançou R$ 50 na conta do Igor sem querer.

1. **Transações → Nova transação** → Receita → Cliente `Igor Bastos Ferraz`,
   Descrição `Lançamento errado`, Valor recebido `50,00`, **Vincular a: Sem vínculo**.
2. Salve.
3. Na lista de Transações, no menu `⋯` da linha, escolha **Estornar**.
4. O sistema pede um **motivo** (`Lançado no cliente errado`) e, depois, que você
   **digite o código da transação** para liberar o botão. Ação que não se desfaz
   não se dispara com um clique distraído.

### Confira

- A transação **continua na lista**, marcada como estornada, e não conta mais nos
  recebimentos.
- As alocações viraram revertidas e, se houvesse parcela vinculada, ela voltaria a
  ficar em aberto.
- **Não existe botão de apagar.** Histórico financeiro precisa de rastro: quem
  lançou, quando, quem estornou e por quê. Apagar esconderia o erro; estornar mostra.
- No mesmo menu existe **Cancelar**, para o lançamento que nunca deveria ter
  acontecido. Estorno é dinheiro que voltou; cancelamento é lançamento que não vale.

---

## Demanda 9 — Guardar o link do contrato assinado

> **A história:** o contrato da Helena foi assinado e está no Drive.

**Documentos → Novo documento**

| Campo | Valor |
|---|---|
| Cliente | `Helena Martins Dias` |
| Título | `Contrato assinado — Helena` |
| URL | qualquer link, ex. `https://drive.google.com/file/d/exemplo-helena` |
| Tipo | `Contrato` |

### Confira

- Abra a **ficha da Helena** em Clientes: o documento está lá, junto do contrato e
  das vendas dela.
- O sistema guardou **o endereço, não o arquivo**. O PDF continua no Drive. Aqui
  fica o caminho até ele, amarrado ao cliente.

> Atalho: no formulário de **Nova venda** existe o campo *Link do contrato
> assinado*. Preenchendo ali, o documento nasce junto com a venda — um passo a menos.

---

## Demanda 10 — Mover o serviço no Kanban

**CRM / Kanban**: arraste o card da Helena de *Atualização da Receita Federal*
para *Emissão de termos de exclusão de consultas*.

Depois **clique no card** para abrir o painel lateral.

### Confira

- Aba **Histórico**: a movimentação ficou registrada com data e autor.
- Aba **Financeiro**: Contratado R$ 1.400,00 · Recebido R$ 900,00 · Pendente
  R$ 500,00 — exatamente o que você viu em Vendas na demanda 3.
- **Esses números não foram digitados aqui.** O CRM lê o financeiro do ERP. Não
  existe segunda fonte de verdade: se divergisse, uma das duas estaria mentindo.

---

## Demanda 11 — Tirar a lista de quem está devendo

> **A história:** você quer ligar para os atrasados hoje e precisa da lista.

**Relatórios → Parcelas vencidas**. Depois clique em **Exportar CSV**.

### Confira

- A tela traz **Carla Mendes Rocha** (do exemplo que já veio no banco) e
  **Lucas Andrade Peixoto** (o que você criou na demanda 5). Mais ninguém.
- O CSV baixado tem exatamente essas linhas — é o mesmo cálculo da tela, não uma
  segunda consulta que poderia divergir.
- Troque para o relatório **Contas a receber**: agora aparece todo mundo com saldo
  em aberto, vencido ou não. Helena, Igor e Júlia entram aí; só os atrasados
  aparecem nos dois.

---

## Demanda 12 — Tentar quebrar o sistema de propósito

Em **Nova venda**, monte um contrato de R$ 1.000 com duas parcelas de R$ 400.

### Confira

- A faixa do planejador fica **âmbar** e escreve `diferença de R$ 200,00`.
- O botão de salvar **recusa o envio**.
- Tente de novo com parcelas somando R$ 1.100: recusa igual, agora por excesso.

A soma das parcelas tem que fechar com o valor contratado, sempre. É a regra que
garante que *contas a receber* nunca minta.

---

## Placar final

Depois das doze demandas, o Dashboard em *Últimos 30 dias* deve ter subido assim
em relação aos números de partida:

| Indicador | Variação | Por quê |
|---|---|---|
| Faturamento contratado | **+ R$ 6.117,00** | Helena 1.400 + Igor 2.800 (já com desconto) + Júlia 1.800 + Mariana 117. O Lucas **não entra**: a venda dele é de setembro, fora da janela de 30 dias. |
| Recebimentos | **+ R$ 2.317,00** | Helena 500 + 400, Júlia 1.300, Mariana 117. O estorno do Igor não conta. |
| Contas a receber | **+ R$ 5.800,00** | Helena 500 + Igor 2.800 + Júlia 500 + Lucas 2.000. |
| Vencido | **+ R$ 2.000,00** | só o Lucas. |
| Despesas pagas | **+ R$ 180,00** | o cartório. |

Se algum número não bater, o lugar de investigar é **Transações**: toda diferença
entre contratado e recebido tem uma transação (ou a falta dela) por trás.

---

## As três ideias que essas demandas ensinam

1. **Venda é promessa, transação é dinheiro.** A venda diz quanto foi cobrado; a
   transação diz quanto entrou. Os dois números quase nunca são iguais, e é por
   isso que existem dois cartões no Dashboard.
2. **Parcela é o alvo, alocação é a mira.** Um pagamento pode abater várias
   parcelas, e uma parcela pode receber vários pagamentos. O que liga os dois é a
   alocação — o que você viu na coluna *Transações* da demanda 4.
3. **Nada se apaga.** Erro se estorna. O sistema prefere um histórico feio e
   verdadeiro a um histórico limpo e inventado.

Para a parte de leitura e as perguntas de fechamento, veja
[EXERCICIOS.md](EXERCICIOS.md).
