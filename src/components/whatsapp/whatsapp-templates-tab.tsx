import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, RefreshCcw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { syncCloudTemplatesAction } from "@/lib/api/whatsapp.functions";

interface WhatsappTemplatesTabProps {
  companyId: string;
  instanceId: string;
}

export function WhatsappTemplatesTab({ companyId, instanceId }: WhatsappTemplatesTabProps) {
  const qc = useQueryClient();

  const { data: templates, isLoading } = useQuery({
    queryKey: ["whatsapp-templates", companyId, instanceId],
    queryFn: async () => {
      if (!instanceId) return [];
      const { data, error } = await supabase
        .from("whatsapp_templates")
        .select("*")
        .eq("whatsapp_instance_id", instanceId)
        .order("name", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!instanceId
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      return await syncCloudTemplatesAction({ data: { instanceId } });
    },
    onSuccess: (res) => {
      toast.success(`Foram sincronizados ${res.count} templates com sucesso!`);
      qc.invalidateQueries({ queryKey: ["whatsapp-templates"] });
    },
    onError: (e: any) => {
      toast.error("Erro na sincronização", { description: e.message });
    }
  });

  if (!instanceId) {
    return null; 
  }

  return (
    <Card className="border-0 shadow-none">
      <CardHeader className="px-0 pt-0">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Templates Oficiais
            </CardTitle>
            <CardDescription>
              Gerencie e sincronize os modelos de mensagem aprovados na Meta.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
            >
              {syncMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
              Sincronizar
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Idioma</TableHead>
                <TableHead>Qualidade</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : !templates?.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    Nenhum template encontrado. Clique em Sincronizar.
                  </TableCell>
                </TableRow>
              ) : (
                templates.map((template) => (
                  <TableRow key={template.id}>
                    <TableCell className="font-medium">{template.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {template.category}
                      </Badge>
                    </TableCell>
                    <TableCell>{template.language}</TableCell>
                    <TableCell>
                      {template.quality_score === 'GREEN' && <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">Alta</Badge>}
                      {template.quality_score === 'YELLOW' && <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">Média</Badge>}
                      {template.quality_score === 'RED' && <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">Baixa</Badge>}
                      {(!template.quality_score || template.quality_score === 'UNKNOWN') && <Badge variant="outline" className="text-muted-foreground">Desconhecido</Badge>}
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant="secondary" 
                        className={
                          template.status === 'APPROVED' ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" :
                          template.status === 'REJECTED' ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" :
                          "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                        }
                      >
                        {template.status === 'APPROVED' ? 'Aprovado' : 
                         template.status === 'REJECTED' ? 'Rejeitado' : 'Pendente'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
