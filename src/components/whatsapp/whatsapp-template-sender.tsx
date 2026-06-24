import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";

interface TemplateSenderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  instanceId: string;
  onSend: (templatePayload: any) => Promise<void>;
  isSending?: boolean;
}

export function WhatsappTemplateSender({ open, onOpenChange, companyId, instanceId, onSend, isSending }: TemplateSenderProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [variables, setVariables] = useState<Record<string, Record<string, string>>>({}); // { "body": { "1": "value" } }

  const { data: templates, isLoading } = useQuery({
    queryKey: ["whatsapp-templates-approved", companyId, instanceId],
    queryFn: async () => {
      if (!instanceId) return [];
      const { data, error } = await supabase
        .from("whatsapp_templates")
        .select("*")
        .eq("whatsapp_instance_id", instanceId)
        .eq("status", "APPROVED")
        .order("name", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: open && !!instanceId
  });

  const selectedTemplate = templates?.find(t => t.id === selectedTemplateId);

  // Extract variables
  const componentVariables = selectedTemplate?.components?.reduce((acc: any, comp: any) => {
    if (comp.text) {
      // match {{1}}, {{2}}
      const matches = comp.text.match(/\{\{(\d+)\}\}/g);
      if (matches) {
        acc[comp.type.toLowerCase()] = matches.map((m: string) => m.replace(/[\{\}]/g, ''));
      }
    }
    return acc;
  }, {}) || {};

  useEffect(() => {
    // Reset variables when template changes
    if (selectedTemplate) {
      const initialVars: Record<string, Record<string, string>> = {};
      Object.keys(componentVariables).forEach(type => {
        initialVars[type] = {};
        componentVariables[type].forEach((v: string) => {
          initialVars[type][v] = "";
        });
      });
      setVariables(initialVars);
    }
  }, [selectedTemplateId]);

  const handleVariableChange = (type: string, variable: string, value: string) => {
    setVariables(prev => ({
      ...prev,
      [type]: {
        ...prev[type],
        [variable]: value
      }
    }));
  };

  const isFormValid = () => {
    if (!selectedTemplate) return false;
    
    // Check if all variables are filled
    for (const type of Object.keys(componentVariables)) {
      for (const v of componentVariables[type]) {
        if (!variables[type]?.[v]) {
          return false;
        }
      }
    }
    return true;
  };

  const handleSend = async () => {
    if (!selectedTemplate) return;

    // Build Meta Template JSON
    const payload: any = {
      name: selectedTemplate.name,
      language: {
        code: selectedTemplate.language
      }
    };

    const hasVariables = Object.keys(variables).some(type => Object.keys(variables[type]).length > 0);

    if (hasVariables) {
      payload.components = [];
      
      Object.keys(variables).forEach(type => {
        const typeVars = variables[type];
        const varKeys = Object.keys(typeVars).sort((a, b) => parseInt(a) - parseInt(b));
        
        if (varKeys.length > 0) {
          payload.components.push({
            type: type.toLowerCase(),
            parameters: varKeys.map(key => ({
              type: "text",
              text: typeVars[key]
            }))
          });
        }
      });
    }

    try {
      await onSend(payload);
      onOpenChange(false);
      setSelectedTemplateId("");
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Enviar Template Oficial</DialogTitle>
          <DialogDescription>
            A janela de 24 horas está fechada. Você precisa enviar um modelo de mensagem aprovado pela Meta para retomar a conversa.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label>Selecione o Template</Label>
            {isLoading ? (
              <div className="flex h-10 items-center justify-center border rounded-md bg-muted/50">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha um template aprovado" />
                </SelectTrigger>
                <SelectContent>
                  {templates?.length === 0 ? (
                    <SelectItem value="none" disabled>Nenhum template aprovado encontrado</SelectItem>
                  ) : (
                    templates?.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} ({t.language})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            )}
          </div>

          {selectedTemplate && (
            <div className="space-y-4 pt-2 border-t mt-2">
              <div className="text-sm font-medium">Preencha as variáveis:</div>
              
              {Object.keys(componentVariables).length === 0 ? (
                <p className="text-sm text-muted-foreground italic">Este template não possui variáveis.</p>
              ) : (
                Object.keys(componentVariables).map(type => (
                  <div key={type} className="space-y-3">
                    <h4 className="text-xs font-semibold uppercase text-muted-foreground">{type}</h4>
                    {componentVariables[type].map((v: string) => (
                      <div key={`${type}-${v}`} className="flex items-center gap-2">
                        <Label className="w-8 shrink-0 text-right">{`{{${v}}}`}</Label>
                        <Input 
                          placeholder={`Valor para {{${v}}}`}
                          value={variables[type]?.[v] || ""}
                          onChange={(e) => handleVariableChange(type, v, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                ))
              )}

              <div className="mt-4 p-3 bg-muted/50 rounded-lg text-sm whitespace-pre-wrap font-mono text-xs">
                {/* Preview of the template with filled variables */}
                {selectedTemplate.components?.map((c: any, i: number) => {
                  if (!c.text) return null;
                  let previewText = c.text;
                  const vars = variables[c.type.toLowerCase()] || {};
                  Object.keys(vars).forEach(key => {
                    previewText = previewText.replace(`{{${key}}}`, vars[key] || `{{${key}}}`);
                  });
                  return (
                    <div key={i} className="mb-2 last:mb-0">
                      <strong className="text-muted-foreground uppercase text-[10px] block mb-1">{c.type}</strong>
                      {previewText}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button 
            onClick={handleSend}
            disabled={!isFormValid() || isSending}
          >
            {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
