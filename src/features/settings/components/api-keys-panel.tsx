"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, KeyRound, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import {
  issueApiKeyAction,
  revokeApiKeyAction,
} from "@/server/integrations/integrations-actions";

export type ApiKeyRow = {
  id: string;
  name: string;
  provider: string;
  prefix: string;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
};

export function ApiKeysPanel({
  apiKeys,
  canManage,
}: {
  apiKeys: ApiKeyRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("Leona Flow");
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function issue() {
    startTransition(async () => {
      const result = await issueApiKeyAction(name);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setIssuedToken(result.data.token);
      toast.success("API key gerada. Copie agora: ela não será exibida novamente.");
      router.refresh();
    });
  }

  function revoke(id: string) {
    startTransition(async () => {
      const result = await revokeApiKeyAction(id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("API key revogada.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="size-4" />
          API keys de integração
        </CardTitle>
        <CardDescription>
          O Leona Flow autentica com <code>Authorization: Bearer &lt;token&gt;</code>. Guardamos
          apenas o hash do token.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {issuedToken ? (
          <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
              Copie o token agora. Ele não será exibido novamente.
            </p>
            <div className="flex gap-2">
              <Input readOnly value={issuedToken} className="font-mono text-xs" />
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  await navigator.clipboard.writeText(issuedToken);
                  toast.success("Token copiado.");
                }}
              >
                <Copy className="size-4" />
                Copiar
              </Button>
            </div>
          </div>
        ) : null}

        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nome da credencial"
              className="w-full sm:w-64"
            />
            <Button type="button" onClick={issue} disabled={isPending}>
              Gerar nova key
            </Button>
          </div>
        ) : null}

        {apiKeys.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Prefixo</TableHead>
                <TableHead>Criada em</TableHead>
                <TableHead>Último uso</TableHead>
                <TableHead>Status</TableHead>
                {canManage ? <TableHead className="w-12" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {apiKeys.map((apiKey) => (
                <TableRow key={apiKey.id}>
                  <TableCell>{apiKey.name}</TableCell>
                  <TableCell className="font-mono text-xs">{apiKey.prefix}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(apiKey.createdAt)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {apiKey.lastUsedAt ? formatDateTime(apiKey.lastUsedAt) : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={apiKey.isActive ? "default" : "outline"}>
                      {apiKey.isActive ? "Ativa" : "Revogada"}
                    </Badge>
                  </TableCell>
                  {canManage ? (
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Revogar"
                        disabled={!apiKey.isActive || isPending}
                        onClick={() => revoke(apiKey.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-muted-foreground text-sm">Nenhuma credencial gerada ainda.</p>
        )}
      </CardContent>
    </Card>
  );
}
