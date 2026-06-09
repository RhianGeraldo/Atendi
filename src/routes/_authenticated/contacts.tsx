import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Search, Phone, Mail, User, Loader2, Building } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useUnit } from "@/lib/unit-context";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ContactDetailsSheet } from "@/components/contacts/contact-details-sheet";

export const Route = createFileRoute("/_authenticated/contacts")({
  component: ContactsPage,
});

function ContactsPage() {
  const { profile } = useAuth();
  const { selectedUnitId } = useUnit();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);

  const { data: contacts, isLoading } = useQuery({
    queryKey: ["contacts", profile?.company_id, searchTerm, selectedUnitId],
    enabled: !!profile?.company_id,
    queryFn: async () => {
      // Se não tem unidade selecionada (Empresa Mãe), pega todos os contatos.
      // Se tem unidade, pega apenas os contatos que têm conversas na unidade logada.
      const relation = selectedUnitId ? 'conversations!inner' : 'conversations';
      
      let query = supabase
        .from("contacts")
        .select(`
          *,
          ${relation} (
            unit_id,
            units ( name ),
            started_at
          )
        `)
        .eq("company_id", profile!.company_id!)
        .order("created_at", { ascending: false });

      if (selectedUnitId) {
        query = query.eq("conversations.unit_id", selectedUnitId);
      }

      if (searchTerm) {
        query = query.or(`name.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      
      // Filter out groups (phone number > 15 characters)
      return data.filter(c => !c.phone || c.phone.length <= 15).map(c => {
        // Sort conversations to get the latest
        const sortedConvs = (c.conversations || []).sort((a: any, b: any) => 
          new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
        );
        const lastConv = sortedConvs[0];
        return {
          ...c,
          last_unit_name: lastConv?.units?.name
        };
      });
    },
  });

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Gestão de Contatos</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Contatos</CardTitle>
          <CardDescription>
            Lista de todos os contatos que interagiram com a sua empresa.
          </CardDescription>
          <div className="mt-4 flex items-center space-x-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou telefone..."
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : contacts && contacts.length > 0 ? (
            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="h-10 px-4 text-left font-medium">Nome</th>
                    <th className="h-10 px-4 text-left font-medium">Contato</th>
                    <th className="h-10 px-4 text-left font-medium hidden md:table-cell">Tags</th>
                    <th className="h-10 px-4 text-left font-medium hidden sm:table-cell">Data de Cadastro</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((contact) => (
                    <tr 
                      key={contact.id} 
                      className="border-b last:border-0 hover:bg-muted/50 cursor-pointer"
                      onClick={() => setSelectedContactId(contact.id)}
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                            <User className="h-4 w-4 text-primary" />
                          </div>
                          <span className="font-medium">{contact.name}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col gap-1 text-muted-foreground">
                          {contact.phone && (
                            <div className="flex items-center gap-1.5">
                              <Phone className="h-3 w-3" />
                              <span>{contact.phone}</span>
                            </div>
                          )}
                          {contact.email && (
                            <div className="flex items-center gap-1.5">
                              <Mail className="h-3 w-3" />
                              <span className="truncate max-w-[150px]">{contact.email}</span>
                            </div>
                          )}
                          {!contact.phone && !contact.email && <span>-</span>}
                        </div>
                        {!selectedUnitId && contact.last_unit_name && (
                          <div className="flex items-center gap-1 mt-2 text-[10px] font-medium px-2 py-0.5 rounded bg-muted/60 text-muted-foreground w-fit">
                            <Building className="h-3 w-3 shrink-0" />
                            <span className="truncate">Última unid: {contact.last_unit_name}</span>
                          </div>
                        )}
                      </td>
                      <td className="p-4 hidden md:table-cell">
                        {contact.tags && contact.tags.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {contact.tags.slice(0, 2).map((tag: string) => (
                              <Badge key={tag} variant="secondary" className="text-[10px]">
                                {tag}
                              </Badge>
                            ))}
                            {contact.tags.length > 2 && (
                              <Badge variant="outline" className="text-[10px]">
                                +{contact.tags.length - 2}
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="p-4 hidden sm:table-cell text-muted-foreground">
                        {format(new Date(contact.created_at), "dd/MM/yyyy", { locale: ptBR })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="rounded-full bg-muted p-3 mb-4">
                <User className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium">Nenhum contato encontrado</h3>
              <p className="text-sm text-muted-foreground max-w-sm mt-1">
                {searchTerm 
                  ? "Não encontramos resultados para a sua busca."
                  : "Os contatos aparecerão aqui automaticamente quando iniciarem uma conversa."}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <ContactDetailsSheet 
        contactId={selectedContactId} 
        open={!!selectedContactId} 
        onOpenChange={(open) => !open && setSelectedContactId(null)} 
      />
    </div>
  );
}
