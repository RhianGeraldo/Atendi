import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, UserPlus, Building2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useActiveCompany } from "@/lib/active-company-context";
import { useUnit } from "@/lib/unit-context";

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
import { useContactSources, getSourceIcon } from "@/lib/use-contact-sources";

interface CreateContactForm {
  name: string;
  phone: string;
  email: string;
  source: string;
  source_details: string;
  unit_id?: string;
}

export function CreateContactDialog({ trigger }: { trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { profile } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  const { selectedUnitId } = useUnit();
  const qc = useQueryClient();
  const { allSources } = useContactSources();

  const companyId = activeCompanyId || profile?.company_id;

  // Busca unidades da empresa
  const { data: units } = useQuery({
    queryKey: ["units", companyId],
    enabled: !!companyId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("units")
        .select("id, name, color")
        .eq("company_id", companyId!)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  // Busca unidade padrão do usuário logado (ex: caso seja atendente de uma unidade específica)
  const { data: userUnitId } = useQuery({
    queryKey: ["user_unit_default", profile?.id],
    enabled: !!profile?.id && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("user_units")
        .select("unit_id")
        .eq("user_id", profile!.id)
        .limit(1)
        .maybeSingle();
      return data?.unit_id || null;
    },
  });

  const canChooseNoUnit =
    profile?.role === "super_admin" ||
    profile?.role === "admin_company" ||
    Boolean(profile?.has_matriz_access);

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<CreateContactForm>({
    defaultValues: {
      name: "",
      phone: "",
      email: "",
      source: "",
      source_details: "",
      unit_id: "",
    },
  });

  const source = watch("source");
  const formUnitId = watch("unit_id");

  // Preenche a unidade inicial ao abrir o diálogo
  useEffect(() => {
    if (open) {
      const defaultUnit = (selectedUnitId && selectedUnitId !== "all") ? selectedUnitId : (userUnitId || "");
      if (defaultUnit) {
        setValue("unit_id", defaultUnit);
      } else if (!canChooseNoUnit && units && units.length > 0) {
        setValue("unit_id", units[0].id);
      }
    }
  }, [open, selectedUnitId, userUnitId, canChooseNoUnit, units, setValue]);

  const createContact = useMutation({
    mutationFn: async (data: CreateContactForm) => {
      if (!companyId) throw new Error("Empresa não selecionada");

      // Clean phone number (remove non-digits, and if starts with 0 or has +55, normalize)
      let cleanPhone = data.phone.replace(/\D/g, "");
      if (cleanPhone && cleanPhone.length >= 10 && !cleanPhone.startsWith("55")) {
        cleanPhone = "55" + cleanPhone;
      }
      if (!cleanPhone) cleanPhone = null as any;

      let effectiveUnitId: string | null = null;
      if (data.unit_id && data.unit_id !== "none") {
        effectiveUnitId = data.unit_id;
      } else if (!canChooseNoUnit) {
        effectiveUnitId = (selectedUnitId && selectedUnitId !== "all") ? selectedUnitId : (userUnitId || (units?.[0]?.id ?? null));
        if (!effectiveUnitId && units && units.length > 0) {
          throw new Error("Selecione uma unidade para o contato.");
        }
      }

      // Obtém usuário autenticado para created_by
      const authUser = (await supabase.auth.getUser()).data.user;
      const creatorId = authUser?.id || profile?.id || null;

      const { data: result, error } = await supabase
        .from("contacts")
        .insert({
          company_id: companyId,
          unit_id: effectiveUnitId || null,
          name: data.name.trim(),
          phone: cleanPhone,
          email: data.email?.trim() || null,
          created_by: creatorId,
          source: data.source || null,
          source_details: data.source_details?.trim() || null,
        })
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      toast.success("Contato criado com sucesso!");
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["contacts-counts"] });
      setOpen(false);
      reset();
    },
    onError: (error: any) => {
      console.error("Erro ao criar contato:", error);
      toast.error("Erro ao criar contato", { description: error.message });
    },
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

          {units && units.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="unit_id">Unidade</Label>
              <Select 
                value={formUnitId || (canChooseNoUnit ? "none" : "")} 
                onValueChange={(val) => setValue("unit_id", val === "none" ? "" : val)}
              >
                <SelectTrigger id="unit_id">
                  <SelectValue placeholder="Selecione a unidade" />
                </SelectTrigger>
                <SelectContent>
                  {canChooseNoUnit && (
                    <SelectItem value="none">
                      <span className="text-muted-foreground">Sem unidade específica (Geral)</span>
                    </SelectItem>
                  )}
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      <div className="flex items-center gap-2">
                        <span 
                          className="h-2.5 w-2.5 rounded-full inline-block shrink-0" 
                          style={{ backgroundColor: u.color || "#3b82f6" }} 
                        />
                        <span>{u.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="source">Origem</Label>
            <Select value={source || ""} onValueChange={(val) => setValue("source", val)}>
              <SelectTrigger id="source">
                <SelectValue placeholder="Selecione a origem" />
              </SelectTrigger>
              <SelectContent>
                {allSources.map(src => (
                  <SelectItem key={src} value={src}>
                    <div className="flex items-center gap-2">
                      {getSourceIcon(src)}
                      <span>{src}</span>
                    </div>
                  </SelectItem>
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
