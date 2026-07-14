import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Users, Save, Loader2, Building2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useActiveCompany } from "@/lib/active-company-context";
import { useUnit } from "@/lib/unit-context";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export function LeadRoutingSettings() {
  const { activeCompanyId } = useActiveCompany();
  const { selectedUnitId } = useUnit();
  const qc = useQueryClient();

  // Armazena as mudanças temporárias antes de salvar (department_id -> is_active)
  const [localToggles, setLocalToggles] = useState<Record<string, boolean>>({});

  const { data: configs, isLoading: loadingConfigs } = useQuery({
    queryKey: ["lead-routing", activeCompanyId, selectedUnitId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      let q = supabase
        .from("lead_routing_configs")
        .select("*")
        .eq("company_id", activeCompanyId!);
      
      if (selectedUnitId) {
        q = q.eq("unit_id", selectedUnitId);
      } else {
        q = q.is("unit_id", null);
      }

      const { data, error } = await q;
      if (error) throw error;
      
      // Initialize local state
      const toggles: Record<string, boolean> = {};
      data.forEach(c => {
        if (c.department_id) toggles[c.department_id] = c.is_active;
      });
      setLocalToggles(toggles);
      
      return data || [];
    }
  });

  const { data: departments, isLoading: loadingDepts } = useQuery({
    queryKey: ["departments", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data } = await supabase.from("departments").select("id, name").eq("company_id", activeCompanyId!);
      return data || [];
    }
  });

  const { data: agents, isLoading: loadingAgents } = useQuery({
    queryKey: ["profiles", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, name, department_id, role, active, has_matriz_access, user_units(unit_id)")
        .eq("company_id", activeCompanyId!);
      return data || [];
    }
  });

  const saveConfigs = useMutation({
    mutationFn: async () => {
      if (!activeCompanyId) throw new Error("Empresa não encontrada");
      
      // Construir payload para upsert
      const upserts = Object.keys(localToggles).map(deptId => {
        // Encontrar o id existente se houver
        const existingConfig = configs?.find(c => c.department_id === deptId);
        
        return {
          id: existingConfig?.id, // se nulo, supabase vai criar novo via default uuid
          company_id: activeCompanyId,
          unit_id: selectedUnitId || null,
          department_id: deptId,
          is_active: localToggles[deptId]
        };
      });

      for (const payload of upserts) {
        if (payload.id) {
          await supabase.from("lead_routing_configs").update({ is_active: payload.is_active }).eq("id", payload.id);
        } else {
          // Removemos id para deixar o banco gerar
          const { id, ...insertPayload } = payload;
          await supabase.from("lead_routing_configs").insert(insertPayload);
        }
      }
    },
    onSuccess: () => {
      toast.success("Configurações da roleta salvas com sucesso!");
      qc.invalidateQueries({ queryKey: ["lead-routing", activeCompanyId] });
    },
    onError: (e) => toast.error("Erro ao salvar", { description: (e as Error).message })
  });

  const toggleDept = (deptId: string, active: boolean) => {
    setLocalToggles(prev => ({ ...prev, [deptId]: active }));
  };

  if (loadingConfigs || loadingDepts || loadingAgents) {
    return <div className="flex items-center justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  const unitAgents = selectedUnitId
    ? agents?.filter(a => a.role === 'admin_company' || a.has_matriz_access || a.user_units?.some((uu: any) => uu.unit_id === selectedUnitId))
    : agents;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Roleta de Atendimentos por Departamento
        </CardTitle>
        <CardDescription>
          Para cada departamento, defina se os novos atendimentos deverão ser distribuídos automaticamente em formato Round Robin (roleta) entre os atendentes ativos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {(!departments || departments.length === 0) ? (
           <div className="p-4 border rounded-lg bg-muted text-center text-sm text-muted-foreground">
             Você não possui departamentos cadastrados nesta empresa.
           </div>
        ) : (
          <Accordion type="multiple" defaultValue={departments.map(d => d.id)} className="w-full space-y-3">
            {departments.map(dept => {
              const deptAgents = unitAgents?.filter(a => a.active && a.department_id === dept.id) || [];
              const isActive = localToggles[dept.id] || false;

              return (
                <AccordionItem key={dept.id} value={dept.id} className="border rounded-lg px-4 bg-card shadow-sm">
                  <div className="flex items-center justify-between py-2 border-b-0">
                    <div className="flex items-center gap-3">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <Label className="text-base font-semibold cursor-pointer">{dept.name}</Label>
                    </div>
                    <div className="flex items-center gap-3">
                      <Label className="text-sm cursor-pointer" htmlFor={`switch-${dept.id}`}>
                        {isActive ? 'Roleta Ativa' : 'Desativado'}
                      </Label>
                      <Switch 
                        id={`switch-${dept.id}`}
                        checked={isActive} 
                        onCheckedChange={(val) => toggleDept(dept.id, val)} 
                      />
                    </div>
                  </div>
                  <AccordionContent className="pt-2 pb-4">
                    <p className="text-sm text-muted-foreground mb-3">
                      {isActive 
                        ? "Quando um novo atendimento cair neste departamento, ele será distribuído entre os seguintes atendentes ativos:" 
                        : "Leads que caírem neste departamento ficarão na lista 'Aguardando' sem dono até que alguém aceite."}
                    </p>
                    {deptAgents.length === 0 ? (
                      <p className="text-sm italic text-muted-foreground bg-muted p-3 rounded-md">
                        Nenhum atendente ativo encontrado neste departamento.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                        {deptAgents.map(agent => (
                          <div 
                            key={agent.id}
                            className={`flex items-center justify-between p-3 border rounded-lg transition-colors ${isActive ? 'bg-primary/5 border-primary/20' : 'bg-muted/30 border-muted opacity-60'}`}
                          >
                            <span className="text-sm font-medium">{agent.name || "Sem Nome"}</span>
                            {isActive && <Badge variant="secondary" className="text-[10px]">Na Roleta</Badge>}
                          </div>
                        ))}
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}
      </CardContent>
      <CardFooter>
        <Button 
          className="w-full sm:w-auto" 
          onClick={() => saveConfigs.mutate()} 
          disabled={saveConfigs.isPending}
        >
          {saveConfigs.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Salvar Configurações
        </Button>
      </CardFooter>
    </Card>
  );
}
