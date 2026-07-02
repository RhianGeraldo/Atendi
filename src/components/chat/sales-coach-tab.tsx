import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Loader2, Bot, Sparkles, RefreshCw, CheckCircle2, Lightbulb, Target, MessageSquare, Copy } from "lucide-react";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { salesCoachAction, salesCoachSuggestAction } from "@/lib/api/chat.functions";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export function SalesCoachTab({
  conversationId,
  open,
  onOpenChange,
  onSuggestion,
}: {
  conversationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuggestion: (text: string) => void;
}) {
  const qc = useQueryClient();
  const [isGeneratingAnalysis, setIsGeneratingAnalysis] = useState(false);
  const [isGeneratingSuggestion, setIsGeneratingSuggestion] = useState(false);
  const [tacticalSuggestion, setTacticalSuggestion] = useState<string | null>(null);

  // Buscar a última análise salva no banco de dados para esta conversa
  const { data: latestAnalysis, isLoading: isLoadingAnalysis, refetch } = useQuery({
    queryKey: ["sales-coach-analysis", conversationId],
    enabled: !!conversationId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_coach_analyses")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      
      if (error && error.code !== "PGRST116") { // Ignore not found
        console.error("Erro ao buscar análise", error);
        return null;
      }
      return data;
    }
  });

  // Action para Gerar nova análise
  const handleGenerateAnalysis = async () => {
    try {
      setIsGeneratingAnalysis(true);
      const res = await salesCoachAction({ data: { conversationId } });
      if (res?.success) {
        toast.success("Análise gerada com sucesso!");
        qc.invalidateQueries({ queryKey: ["sales-coach-analysis", conversationId] });
        refetch();
      }
    } catch (err: any) {
      toast.error(err.message || "Falha ao gerar análise");
    } finally {
      setIsGeneratingAnalysis(false);
    }
  };

  // Action para Gerar Sugestão de Mensagem baseada na análise
  const handleGenerateSuggestion = async () => {
    try {
      setIsGeneratingSuggestion(true);
      setTacticalSuggestion(null);
      const res = await salesCoachSuggestAction({ data: { conversationId } });
      if (res?.success && res.text) {
        setTacticalSuggestion(res.text);
      }
    } catch (err: any) {
      toast.error(err.message || "Falha ao gerar sugestão de resposta");
    } finally {
      setIsGeneratingSuggestion(false);
    }
  };

  const handleCopySuggestion = () => {
    if (!tacticalSuggestion) return;
    
    // Tenta extrair apenas a "Sugestão de fala" se ela existir, caso contrário copia tudo
    const match = tacticalSuggestion.match(/Sugestão de fala:\*\*\s*"([^"]+)"/i) || tacticalSuggestion.match(/Sugestão de fala:\*\*\s*(.+)/i);
    const textToCopy = match ? match[1] : tacticalSuggestion;
    
    onSuggestion(textToCopy);
    toast.success("Sugestão de fala copiada para o chat!");
  };

  return (
    <div className="flex flex-col bg-transparent">
      <div className="pb-4 border-b border-border shrink-0 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-500/10 text-amber-500 rounded-lg">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Sales Coach IA</h3>
              <p className="text-sm text-muted-foreground">
                Avaliação inteligente do atendimento e contorno de objeções
              </p>
            </div>
          </div>
          
          {latestAnalysis && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerateAnalysis}
              disabled={isGeneratingAnalysis || isGeneratingSuggestion}
              className="h-8 text-xs gap-1.5"
            >
              {isGeneratingAnalysis ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Refazer Análise
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-6 min-w-0 w-full">
        {isLoadingAnalysis ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground space-y-4">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p>Buscando histórico do treinador...</p>
          </div>
        ) : !latestAnalysis ? (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 max-w-sm mx-auto">
            <div className="p-4 bg-primary/10 text-primary rounded-full mb-2">
              <Sparkles className="h-10 w-10" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">Nenhuma análise feita</h3>
            <p className="text-sm text-muted-foreground">
              Clique no botão abaixo para que a Inteligência Artificial analise as mensagens recentes desta conversa e monte um relatório de vendas.
            </p>
            <Button 
              onClick={handleGenerateAnalysis} 
              disabled={isGeneratingAnalysis}
              className="w-full mt-2 bg-amber-500 hover:bg-amber-600 text-white"
            >
              {isGeneratingAnalysis ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analisando a conversa...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Analisar Agora
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-6 min-w-0 w-full">
            {/* Resultado do Markdown */}
            <div className="prose prose-sm w-full min-w-0 overflow-hidden dark:prose-invert max-w-none 
              prose-table:w-full prose-table:table-fixed prose-table:border-collapse prose-table:text-sm prose-td:border prose-td:border-border prose-td:p-2 prose-td:break-words prose-td:whitespace-pre-wrap prose-th:border prose-th:border-border prose-th:bg-muted/50 prose-th:p-2 prose-th:text-left
              prose-h2:text-primary prose-h2:text-lg prose-h2:font-semibold prose-h2:mt-4 prose-h2:mb-2
              prose-p:leading-relaxed prose-p:text-muted-foreground
              prose-li:text-muted-foreground prose-strong:text-foreground
            ">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {latestAnalysis.analysis_markdown}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>

      {/* Rodapé fixo com o Botão de Sugerir Resposta */}
      {latestAnalysis && (
        <div className="pt-4 mt-6 border-t border-border shrink-0 space-y-4">
          
          {tacticalSuggestion && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-sm space-y-3 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-2 opacity-10 pointer-events-none">
                <Lightbulb className="w-16 h-16 text-amber-500" />
              </div>
              
              <h4 className="font-semibold text-amber-600 flex items-center gap-1.5 mb-2">
                <Sparkles className="h-4 w-4" />
                Guia Tático do Coach
              </h4>
              
              <div className="prose prose-sm w-full min-w-0 overflow-x-auto dark:prose-invert prose-p:my-1 prose-strong:text-amber-700 dark:prose-strong:text-amber-400">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {tacticalSuggestion}
                </ReactMarkdown>
              </div>
              
              <Button 
                onClick={handleCopySuggestion}
                variant="outline"
                size="sm"
                className="w-full mt-3 bg-background/50 hover:bg-background border-amber-500/30 text-amber-600 hover:text-amber-700 gap-1.5"
              >
                <Copy className="h-3.5 w-3.5" />
                Usar a sugestão de fala
              </Button>
            </div>
          )}

          <div className="flex flex-col space-y-3">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                <span>Última análise: {new Date(latestAnalysis.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>
            
            <Button 
              onClick={handleGenerateSuggestion}
              disabled={isGeneratingSuggestion || isGeneratingAnalysis}
              className="w-full h-11 bg-amber-500 hover:bg-amber-600 text-white gap-2 text-base font-semibold transition-all shadow-md hover:shadow-lg"
            >
              {isGeneratingSuggestion ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Pensando na melhor tática...
                </>
              ) : (
                <>
                  <Target className="h-5 w-5" />
                  Gerar Guia Tático
                </>
              )}
            </Button>
            <p className="text-center text-[11px] text-muted-foreground mt-1">
              A IA vai sugerir a estratégia e o que você deve falar a seguir.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
