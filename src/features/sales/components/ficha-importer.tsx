"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ClipboardPaste, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { CurrencyInput } from "@/components/common/currency-input";
import { Field } from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/format";
import { lerFichaVenda, type FichaVenda } from "@/lib/importers/ficha-venda";
import { montarPlano, type ParcelaPlanejada } from "@/lib/importers/plano-parcelas";
import { criarDaFichaAction } from "@/server/imports/ficha-actions";

export type OpcaoSimples = { id: string; name: string };

type Props = {
  produtos: OpcaoSimples[];
  formasPagamento: OpcaoSimples[];
};

const MODELO = `Nome completo:
CPF:
E-mail:
Endereço completo:
Telefone pessoal:
Data de fechamento do serviço:
Valor total do serviço:
Número de parcelas:
Valor da entrada:
Data de pagamento da entrada:
Valor da parcela intermediária (se houver):
Data de pagamento da parcela intermediária (se houver):`;

const VAZIA: FichaVenda = {
  nome: null,
  cpf: null,
  email: null,
  endereco: null,
  telefone: null,
  fechamentoEm: null,
  valorTotal: null,
  parcelas: null,
  entradaValor: null,
  entradaEm: null,
  intermediariaValor: null,
  intermediariaEm: null,
};

const hojeIso = () => {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(
    agora.getDate(),
  ).padStart(2, "0")}`;
};

const comHora = (iso: string) => new Date(`${iso}T12:00:00`);

export function FichaImporter({ produtos, formasPagamento }: Props) {
  const router = useRouter();
  const [salvando, iniciarSalvamento] = useTransition();

  const [texto, setTexto] = useState("");
  const [leu, setLeu] = useState(false);
  const [ficha, setFicha] = useState<FichaVenda>(VAZIA);
  const [naoLidos, setNaoLidos] = useState<string[]>([]);
  const [faltando, setFaltando] = useState<string[]>([]);

  const [produtoId, setProdutoId] = useState(produtos[0]?.id ?? "");
  const [formaId, setFormaId] = useState<string>("");
  const [entradaRecebida, setEntradaRecebida] = useState(false);

  const plano = useMemo(() => montarPlano(ficha), [ficha]);

  const totalPlano = plano.parcelas.reduce((acc, p) => acc + Number(p.amount), 0);

  function ler() {
    const leitura = lerFichaVenda(texto);
    setFicha(leitura.dados);
    setNaoLidos(leitura.naoLidos);
    setFaltando(leitura.faltando);
    setLeu(true);

    const lidos = Object.values(leitura.dados).filter((v) => v !== null).length;
    toast.success(`${lidos} de 12 campos lidos.`);
  }

  async function colarDaAreaDeTransferencia() {
    try {
      const copiado = await navigator.clipboard.readText();
      if (copiado.trim()) setTexto(copiado);
    } catch {
      toast.error("O navegador não liberou a área de transferência. Cole com Ctrl+V.");
    }
  }

  const campo = <K extends keyof FichaVenda>(chave: K, valor: FichaVenda[K]) =>
    setFicha((atual) => ({ ...atual, [chave]: valor }));

  function criar() {
    iniciarSalvamento(async () => {
      const resultado = await criarDaFichaAction({
        nome: ficha.nome ?? "",
        cpf: ficha.cpf,
        email: ficha.email,
        endereco: ficha.endereco,
        telefone: ficha.telefone,
        // Meio-dia local, como no resto do sistema. Mandando so "2026-11-05"
        // o servidor le meia-noite UTC e, em Brasilia, a data volta um dia.
        fechamentoEm: comHora(ficha.fechamentoEm ?? hojeIso()),
        valorTotal: ficha.valorTotal ?? "0",
        productId: produtoId,
        parcelas: plano.parcelas.map((parcela) => ({
          ...parcela,
          dueDate: comHora(parcela.dueDate),
        })),
        entradaRecebida,
        paymentMethodId: formaId || null,
      });

      if (!resultado.success) {
        toast.error(resultado.error);
        return;
      }

      const { clienteCriado, saleCode, transacaoCode } = resultado.data;
      toast.success(
        [
          clienteCriado ? "Cliente criado" : "Cliente já existia e foi atualizado",
          `venda ${saleCode}`,
          transacaoCode ? `entrada ${transacaoCode}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
      );
      router.push(`/vendas/${resultado.data.saleId}`);
    });
  }

  const podeCriar =
    leu &&
    !!ficha.nome &&
    !!ficha.valorTotal &&
    !!produtoId &&
    plano.parcelas.length > 0 &&
    !salvando;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Resposta do cliente</CardTitle>
          <CardDescription>
            Cole aqui o que o cliente respondeu no WhatsApp. A leitura é feita por aqui mesmo, sem
            mandar o texto para fora.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={texto}
            onChange={(event) => setTexto(event.target.value)}
            placeholder={MODELO}
            rows={12}
            className="font-mono text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={ler} disabled={!texto.trim()}>
              <Wand2 className="mr-2 size-4" />
              Ler ficha
            </Button>
            <Button type="button" variant="outline" onClick={colarDaAreaDeTransferencia}>
              <ClipboardPaste className="mr-2 size-4" />
              Colar
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => navigator.clipboard.writeText(MODELO)}
            >
              Copiar o modelo para mandar ao cliente
            </Button>
          </div>
        </CardContent>
      </Card>

      {leu ? (
        <>
          {(naoLidos.length > 0 || faltando.length > 0) && (
            <Card className="border-amber-500/40">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="size-4 text-amber-500" />
                  Confira antes de criar
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm text-muted-foreground">
                {faltando.map((item) => (
                  <p key={item}>Não veio na ficha: {item}</p>
                ))}
                {naoLidos.map((item) => (
                  <p key={item}>Não entendi {item}</p>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Cliente</CardTitle>
              <CardDescription>
                Se já existir alguém com este CPF ou telefone, a venda entra no cadastro que já
                existe em vez de criar outro.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome completo" required>
                <Input
                  value={ficha.nome ?? ""}
                  onChange={(e) => campo("nome", e.target.value || null)}
                />
              </Field>
              <Field label="CPF">
                <Input
                  value={ficha.cpf ?? ""}
                  onChange={(e) => campo("cpf", e.target.value || null)}
                />
              </Field>
              <Field label="Telefone">
                <Input
                  value={ficha.telefone ?? ""}
                  onChange={(e) => campo("telefone", e.target.value || null)}
                />
              </Field>
              <Field label="E-mail">
                <Input
                  value={ficha.email ?? ""}
                  onChange={(e) => campo("email", e.target.value || null)}
                />
              </Field>
              <Field label="Endereço" className="sm:col-span-2">
                <Input
                  value={ficha.endereco ?? ""}
                  onChange={(e) => campo("endereco", e.target.value || null)}
                />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Venda</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Serviço vendido" required>
                <Select value={produtoId} onValueChange={(valor) => setProdutoId(valor ?? "")}>
                  <SelectTrigger>
                    {/* O Select mostra o valor cru quando nao recebe rotulo:
                        sem isto, aparece o id do produto no lugar do nome. */}
                    <SelectValue>
                      {produtos.find((produto) => produto.id === produtoId)?.name ??
                        "Escolha o serviço"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {produtos.map((produto) => (
                      <SelectItem key={produto.id} value={produto.id}>
                        {produto.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Data de fechamento" required>
                <Input
                  type="date"
                  value={ficha.fechamentoEm ?? ""}
                  onChange={(e) => campo("fechamentoEm", e.target.value || null)}
                />
              </Field>
              <Field label="Valor total" required>
                <CurrencyInput
                  value={ficha.valorTotal ?? "0"}
                  onValueChange={(valor) => campo("valorTotal", valor)}
                />
              </Field>
              <Field label="Número de parcelas">
                <Input
                  type="number"
                  min={1}
                  value={ficha.parcelas ?? ""}
                  onChange={(e) =>
                    campo("parcelas", e.target.value ? Number(e.target.value) : null)
                  }
                />
              </Field>
              <Field label="Valor da entrada">
                <CurrencyInput
                  value={ficha.entradaValor ?? "0"}
                  onValueChange={(valor) =>
                    campo("entradaValor", Number(valor) > 0 ? valor : null)
                  }
                />
              </Field>
              <Field label="Data da entrada">
                <Input
                  type="date"
                  value={ficha.entradaEm ?? ""}
                  onChange={(e) => campo("entradaEm", e.target.value || null)}
                />
              </Field>
              <Field label="Parcela intermediária">
                <CurrencyInput
                  value={ficha.intermediariaValor ?? "0"}
                  onValueChange={(valor) =>
                    campo("intermediariaValor", Number(valor) > 0 ? valor : null)
                  }
                />
              </Field>
              <Field label="Data da intermediária">
                <Input
                  type="date"
                  value={ficha.intermediariaEm ?? ""}
                  onChange={(e) => campo("intermediariaEm", e.target.value || null)}
                />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Parcelas que vão ser criadas</CardTitle>
              <CardDescription>
                Somam {formatCurrency(String(totalPlano))} — o contrato nasce com este plano.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {plano.avisos.map((aviso) => (
                <p key={aviso} className="text-sm text-amber-500">
                  {aviso}
                </p>
              ))}

              {plano.parcelas.length > 0 ? (
                <div className="divide-y rounded-md border">
                  {plano.parcelas.map((parcela: ParcelaPlanejada, indice) => (
                    <div
                      key={`${parcela.dueDate}-${indice}`}
                      className="flex items-center justify-between px-3 py-2 text-sm"
                    >
                      <span>{parcela.label ?? `Parcela ${indice + 1}`}</span>
                      <span className="text-muted-foreground">
                        {parcela.dueDate.split("-").reverse().join("/")}
                      </span>
                      <span className="font-medium">{formatCurrency(parcela.amount)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Informe o valor total para montar o plano.
                </p>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Forma de pagamento">
                  <Select value={formaId} onValueChange={(valor) => setFormaId(valor ?? "")}>
                    <SelectTrigger>
                      <SelectValue>
                        {formasPagamento.find((forma) => forma.id === formaId)?.name ?? "Opcional"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {formasPagamento.map((forma) => (
                        <SelectItem key={forma.id} value={forma.id}>
                          {forma.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field
                  label="A entrada já foi paga"
                  hint="Lança a primeira parcela como recebida no caixa."
                >
                  <div className="flex h-10 items-center">
                    <Switch checked={entradaRecebida} onCheckedChange={setEntradaRecebida} />
                  </div>
                </Field>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setLeu(false)}>
              Voltar ao texto
            </Button>
            <Button type="button" onClick={criar} disabled={!podeCriar}>
              {salvando ? "Criando..." : "Criar cliente, venda e contrato"}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
