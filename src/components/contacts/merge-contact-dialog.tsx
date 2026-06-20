import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, GitMerge, Search, User, Info, ArrowLeft, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useUnit } from "@/lib/unit-context";
import { cn } from "@/lib/utils";

export function MergeContactDialog({ sourceContact, onSuccess }: { sourceContact: any, onSuccess?: (targetId: string) => void }) {
  const qc = useQueryClient();
  const { selectedUnit } = useUnit();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedTarget, setSelectedTarget] = useState<any | null>(null);

  // Field selection state
  const [selectedName, setSelectedName] = useState<"source" | "target">("target");

  const { data: contacts, isLoading } = useQuery({
    queryKey: ["contacts-search", search, selectedUnit],
    enabled: open && search.length > 2 && !selectedTarget,
    queryFn: async () => {
      let q = supabase
        .from("contacts")
        .select("id, name, phone, whatsapp_lid, instagram_username, profile_picture_url")
        .neq("id", sourceContact.id)
        .is("merged_into_id", null)
        .limit(10);
      
      if (selectedUnit) {
        q = q.eq("unit_id", selectedUnit);
      }
      
      if (search) {
        q = q.or(`name.ilike.%${search}%,phone.ilike.%${search}%,whatsapp_lid.ilike.%${search}%`);
      }
      
      const { data, error } = await q;
      if (error) throw error;
      return data;
    }
  });

  const mergeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTarget) return;

      const finalName = selectedName === "source" ? sourceContact.name : selectedTarget.name;
      const finalPhone = selectedTarget.phone || sourceContact.phone;
      const finalLid = selectedTarget.whatsapp_lid; // Target keeps its lid, source keeps its own
      const finalInsta = selectedTarget.instagram_username || sourceContact.instagram_username;
      
      // Try to keep the one that actually has a picture if the other doesn't
      const finalPic = selectedTarget.profile_picture_url || sourceContact.profile_picture_url;

      const { error } = await supabase.rpc('merge_contacts', {
        source_id: sourceContact.id,
        target_id: selectedTarget.id,
        final_name: finalName,
        final_phone: finalPhone,
        final_whatsapp_lid: finalLid,
        final_instagram_username: finalInsta,
        final_profile_picture_url: finalPic
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contatos mesclados e unificados com sucesso!");
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      setOpen(false);
      onSuccess?.(selectedTarget.id);
    },
    onError: (error) => {
      toast.error("Erro ao mesclar contatos", { description: error.message });
    }
  });

  // Reset state when opening/closing
  React.useEffect(() => {
    if (open) {
      setSearch("");
      setSelectedTarget(null);
      setSelectedName("target");
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" title="Mesclar contato">
          <GitMerge className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {selectedTarget ? "Revisar Informações" : "Mesclar Contato"}
          </DialogTitle>
          <DialogDescription>
            {selectedTarget 
              ? "Escolha quais informações você deseja manter no contato final." 
              : <span>Escolha o Contato Principal para mesclar <strong>{sourceContact.name}</strong>.</span>}
          </DialogDescription>
        </DialogHeader>
        
        {!selectedTarget ? (
          <div className="space-y-4 mt-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Buscar por nome ou número..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <ScrollArea className="h-[300px] border rounded-md">
              {!search || search.length <= 2 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  Digite pelo menos 3 caracteres para buscar contatos.
                </div>
              ) : isLoading ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !contacts || contacts.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  Nenhum contato encontrado.
                </div>
              ) : (
                <div className="p-2 space-y-2">
                  {contacts.map((c) => (
                    <div key={c.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-3 overflow-hidden">
                        {c.profile_picture_url ? (
                          <img src={c.profile_picture_url} className="h-8 w-8 rounded-full object-cover shrink-0" />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <User className="h-4 w-4 text-primary" />
                          </div>
                        )}
                        <div className="overflow-hidden">
                          <p className="font-medium text-sm truncate">{c.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {c.phone || c.whatsapp_lid || 'Sem número'}
                            {c.instagram_username && ` • @${c.instagram_username}`}
                          </p>
                        </div>
                      </div>
                      <Button 
                        size="sm" 
                        variant="secondary"
                        onClick={() => setSelectedTarget(c)}
                      >
                        Selecionar
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        ) : (
          <div className="space-y-6 mt-2">
            
            <div className="space-y-4 border rounded-lg p-4 bg-muted/20">
              {/* Field Selection: Name */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground">Qual Nome manter?</Label>
                <RadioGroup value={selectedName} onValueChange={(v: any) => setSelectedName(v)} className="grid grid-cols-2 gap-2">
                  <Label
                    htmlFor="name-target"
                    className={cn("flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-3 hover:bg-accent hover:text-accent-foreground [&:has([data-state=checked])]:border-primary cursor-pointer", selectedName === "target" && "border-primary bg-primary/5")}
                  >
                    <RadioGroupItem value="target" id="name-target" className="sr-only" />
                    <span className="font-medium truncate w-full text-center">{selectedTarget.name || '-'}</span>
                  </Label>
                  <Label
                    htmlFor="name-source"
                    className={cn("flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-3 hover:bg-accent hover:text-accent-foreground [&:has([data-state=checked])]:border-primary cursor-pointer", selectedName === "source" && "border-primary bg-primary/5")}
                  >
                    <RadioGroupItem value="source" id="name-source" className="sr-only" />
                    <span className="font-medium truncate w-full text-center">{sourceContact.name || '-'}</span>
                  </Label>
                </RadioGroup>
              </div>
              <div className="text-xs text-muted-foreground mt-4 px-2">
                Os demais dados (Telefone, @Instagram, etc) serão combinados automaticamente para não perder nenhuma informação.
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button variant="ghost" onClick={() => setSelectedTarget(null)}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
              </Button>
              <Button onClick={() => mergeMutation.mutate()} disabled={mergeMutation.isPending}>
                {mergeMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Unificar e Mesclar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
