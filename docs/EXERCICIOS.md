# Exercícios — entendendo o sistema pelos dados de exemplo

O seed cria sete clientes fictícios. Cada um é **uma história de pagamento diferente**,
porque é aí que mora a diferença entre o que foi vendido e o que entrou no caixa.

Login: `admin@local.test` / `Admin@123456`

> Nenhum dado é de pessoa real. CPFs são válidos no cálculo, mas inventados.

---

## O que já está no banco

| Cliente | Venda | Contrato | História |
|---|---|---|---|
| Ana Clara Souza | VND-2026-00001 | CTR-2026-00001 — R$ 5.400 em 3 parcelas | Pagou entrada e parcela do meio. Falta a última. |
| Bruno Henrique Lima | VND-2026-00002 | CTR-2026-00002 — R$ 1.400 em 2 parcelas | Fechou há 6 dias e **ainda não pagou nada**. |
| Carla Mendes Rocha | VND-2026-00003 | CTR-2026-00003 — R$ 5.000 em 3 parcelas | **Inadimplente**: duas parcelas vencidas, R$ 3.500 em atraso. |
| Diego Araújo Nunes | VND-2026-00004 | CTR-2026-00004 — R$ 1.400 à vista | Pagou tudo no ato. Contrato **concluído**. |
| Elaine Castro Vieira | VND-2026-00005 | CTR-2026-00005 — R$ 3.600 em 4 parcelas | Mandou **um Pix de R$ 2.250** que quitou duas parcelas e deixou a terceira pela metade. |
| Fábio Rezende Alves | VND-2026-00006 | — | Só **consulta de R$ 117**. Sem contrato, sem card no CRM. |
| Gabriela Nunes Prado | VND-2026-00007 e VND-2026-00008 | CTR-2026-00006 — R$ 1.283 em 2 parcelas | Fez a consulta e **depois virou serviço**, com o valor da consulta abatido. |

Despesas lançadas: tráfego pago (R$ 1.200 e R$ 950), custo de consultas (R$ 250),
assinaturas (R$ 389,90) e contador (R$ 600).

---

## Parte 1 — Ler antes de mexer

**1. Por que o Dashboard mostra "faturamento contratado" diferente de "recebimentos"?**
Abra o Dashboard em *Últimos 90 dias*. Compare os dois primeiros cartões.
→ Contratado é o valor das vendas fechadas. Recebimentos é dinheiro que entrou.
A Carla contratou R$ 5.000 e não pagou nada: entra no primeiro, não no segundo.

**2. Quem está devendo e há quanto tempo?**
Vá em **Financeiro**. Ordene mentalmente pelas vencidas.
→ Carla, duas parcelas, R$ 3.500. É o único cliente em atraso.

**3. Onde aparece a parcela que foi paga pela metade?**
Também em **Financeiro**, procure a Elaine.
→ Parcela 3: previsto R$ 900, saldo R$ 450, status *Parcialmente paga*.

**4. Um pagamento só pode quitar mais de uma parcela?**
Abra **Vendas → VND-2026-00005** (Elaine) e olhe a coluna *Transações*.
→ O mesmo código de transação aparece em três parcelas. Um Pix, três destinos.

**5. Qual a diferença entre a Fábio e a Ana no CRM?**
Abra **CRM / Kanban**.
→ O Fábio não tem card. Consulta não gera card; serviço gera. Isso é configuração
do catálogo, em **Serviços**.

**6. Cliente e contrato são a mesma coisa?**
Abra a ficha da Gabriela em **Clientes**.
→ Uma pessoa, duas vendas, um contrato. Cliente é quem é; contrato é o acordo.
O "i" ao lado do título de cada tela explica isso.

---

## Parte 2 — Fazer

**7. Receber a parcela da Ana.**
Transações → Nova transação → Receita → cliente *Ana Clara Souza* → em *Vincular a*
escolha `CTR-2026-00001`. O valor já vem preenchido com R$ 1.350.
→ Depois confira: a venda vira *Paga*, o contrato vira *Concluído* e o Dashboard
soma R$ 1.350 em recebimentos — sem mudar o faturamento contratado.

**8. Receber metade da parcela do Bruno.**
Mesmo caminho, mas troque o valor recebido para R$ 300.
→ A parcela fica *Parcialmente paga* com saldo de R$ 400. O sistema não deixa a
parcela "sumir" só porque alguém pagou um pedaço.

**9. Lançar uma despesa com categoria nova.**
Transações → Nova transação → aba *Despesa* → em Categoria, "+ Nova categoria",
escreva `Cartório`, Enter. Valor R$ 180.
→ Aparece no Dashboard em *Despesas por categoria* e derruba o lucro operacional.

**10. Vender para alguém que ainda não existe.**
Vendas → Nova venda → no seletor de cliente, "Cadastrar novo cliente". Nome, CPF,
telefone. Depois adicione *Serviço de regularização*, gere 3 parcelas e cole
qualquer link em *Link do contrato assinado*.
→ Confira em **Documentos**: o link está lá, amarrado ao cliente e ao contrato.
E em **CRM**: nasceu um card na primeira etapa.

**11. Mover o serviço no Kanban.**
Arraste o card novo para *Emissão de termos de exclusão*.
→ Abra o card: a aba *Histórico* registrou a movimentação com data e autor. A aba
*Financeiro* mostra os números do contrato — lidos do ERP, não digitados de novo.

**12. Errar de propósito e desfazer.**
Lance uma receita de R$ 50 para a Carla, depois use o menu da linha em Transações
para estornar.
→ A transação continua na lista, marcada como estornada. Nada é apagado: o
histórico financeiro precisa ser auditável.

**13. Tentar quebrar o parcelamento.**
Em Nova venda, monte parcelas que não somam o total.
→ A faixa fica âmbar e o sistema recusa o envio. A soma das parcelas tem que
fechar com o valor contratado, sempre.

**14. Exportar.**
Relatórios → *Parcelas vencidas* → Exportar CSV.
→ Deve sair só a Carla.

---

## Parte 3 — Conferir se entendeu

Responda sem olhar:

1. Vendi R$ 10.000 hoje em 10 parcelas. Quanto entra em *Recebimentos* do mês?
2. O cliente pagou R$ 1.000 e deve três parcelas de R$ 500. O que acontece?
3. Por que não dá para apagar uma transação?
4. O CRM pode mostrar um valor diferente do financeiro?
5. Uma consulta de R$ 117 gera card no Kanban?

<details>
<summary>Respostas</summary>

1. Zero, até alguém registrar uma transação liquidada. Faturamento contratado sobe R$ 10.000.
2. Abate as duas mais antigas (R$ 500 + R$ 500) e a terceira fica intacta. Se o valor não fechasse uma parcela inteira, ela ficaria parcialmente paga.
3. Porque o histórico financeiro precisa ser auditável. O certo é estornar, que deixa o rastro.
4. Não. O CRM lê o financeiro do ERP; não existe segunda fonte de verdade.
5. Não. No catálogo, *Consulta* tem "gerar card no CRM" desligado.

</details>

---

Quer mexer de verdade, com dados prontos para digitar e o resultado esperado de
cada passo? Veja [PRATICA.md](PRATICA.md).
