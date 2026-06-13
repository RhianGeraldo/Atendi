import { useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, UserPlus } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface CreateContactForm {
  name: string;
  phone: string;
  email: string;
  source: string;
  source_details: string;
}

const SOURCES = [
  "Instagram",
  "Facebook",
  "Indicação",
  "Prospecção Ativa",
  "Outros"
];

export function CreateContactDialog({ trigger }: { trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { profile } = useAuth();
  const qc = useQueryClient();

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<CreateContactForm>({
    defaultValues: {
      name: "",
      phone: "",
      email: "",
      source: "",
      source_details: ""
    }
  });

  const source = watch("source");

  const createContact = useMutation({
    mutationFn: async (data: CreateContactForm) => {
      if (!profile?.company_id) throw new Error("Empresa não encontrada");
      
      // Clean phone number (remove non-digits, and if starts with 0 or has +55, normalize)
      let cleanPhone = data.phone.replace(/\D/g, "");
      if (cleanPhone && cleanPhone.length >= 10 && !cleanPhone.startsWith('55')) {
        cleanPhone = '55' + cleanPhone;
      }
      if (!cleanPhone) cleanPhone = null as any;

      const { data: result, error } = await supabase
        .from("contacts")
        .insert({
          company_id: profile.company_id,
          name: data.name,
          phone: cleanPhone,
          email: data.email || null,
          created_by: profile.id,
          source: data.source || null,
          source_details: data.source_details || null
        })
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      toast.success("Contato criado com sucesso!");
      qc.invalidateQueries({ queryKey: ["contacts"] });
      setOpen(false);
      reset();
    },
    onError: (error) => {
      toast.error("Erro ao criar contato", { description: error.message });
    }
  });

  const onSubmit = (data: CreateContactForm) => {
    createContact.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="sm">
            <UserPlus className="mr-2 h-4 w-4" />
            Adicionar Contato
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Novo Contato</DialogTitle>
          <DialogDescription>
            Adicione um novo contato manualmente à sua base.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome <span className="text-destructive">*</span></Label>
            <Input 
              id="name" 
              placeholder="Ex: João Silva" 
              {...register("name", { required: "Nome é obrigatório" })} 
            />
            {errors.name && <span className="text-xs text-destructive">{errors.name.message}</span>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Telefone / WhatsApp</Label>
            <Input 
              id="phone" 
              placeholder="Ex: 11999999999" 
              {...register("phone")} 
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input 
              id="email" 
              type="email" 
              placeholder="Ex: joao@email.com" 
              {...register("email")} 
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="source">Origem</Label>
            <Select onValueChange={(val) => setValue("source", val)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a origem" />
              </SelectTrigger>
              <SelectContent>
                {SOURCES.map(src => (
                  <SelectItem key={src} value={src}>{src}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {source && (
            <div className="space-y-2">
              <Label htmlFor="source_details">Detalhes (Por quem? Qual campanha?)</Label>
              <Input 
                id="source_details" 
                placeholder={source === "Indicação" ? "Nome de quem indicou" : "Ex: Campanha Dia das Mães"} 
                {...register("source_details")} 
              />
            </div>
          )}

          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={createContact.isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={createContact.isPending}>
              {createContact.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Salvar Contato
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
