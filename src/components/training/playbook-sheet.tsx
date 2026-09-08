import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BookOpen,
  Search,
  Copy,
  PlusCircle,
  ExternalLink,
  Loader2,
  FileText,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { fetchSalesPlaybookProceduresAction } from "@/lib/api/training.functions";

interface PlaybookSheetProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
  onInsertText?: (text: string) => void;
}

export function PlaybookSheet({
  isOpen,
  onClose,
  companyId,
  onInsertText,
}: PlaybookSheetProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const { data: procedures, isLoading } = useQuery({
    queryKey: ["playbook-sheet-procedures", companyId, selectedCategory, searchTerm],
    enabled: isOpen && !!companyId,
    queryFn: async () => {
      const res = await fetchSalesPlaybookProceduresAction({
        data: {
          companyId,
          category: selectedCategory === "all" ? undefined : selectedCategory,
          search: searchTerm.trim() || undefined,
        },
      });
      return (res.procedures || []).filter((p: any) => p.is_active);
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Conteúdo copiado!");
  };

  const handleInsert = (text: string) => {
    if (onInsertText) {
      onInsertText(text);
      toast.success("Inserido no campo de mensagem!");
      onClose();
    } else {
      copyToClipboard(text);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col h-full bg-background border-l border-border">
        {/* Header */}
        <SheetHeader className="p-4 border-b border-border space-y-1">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-base font-bold flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-emerald-600" />
              Playbook & Procedimentos
            </SheetTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onClose();
                window.location.href = "/training";
              }}
              className="text-[11px] gap-1 text-muted-foreground hover:text-foreground h-7 px-2"
              title="Abrir no Treinamento"
            >
              <span>Gerenciar</span>
              <ExternalLink className="w-3 h-3" />
            </Button>
          </div>
          <SheetDescription className="text-xs text-muted-foreground">
            Consulte procedimentos oficiais, explicações e scripts comerciais para usar no atendimento.
          </SheetDescription>

          {/* Busca */}
          <div className="pt-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar procedimentos, regras, dúvidas..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 h-8 text-xs rounded-lg"
              />
            </div>
          </div>

          {/* Categorias */}
          <div className="flex items-center gap-1 overflow-x-auto pt-1 pb-0.5 no-scrollbar">
            {[
              { id: "all", label: "Todos" },
              { id: "procedure", label: "Procedimentos" },
              { id: "faq", label: "Dúvidas" },
              { id: "pricing", label: "Preços" },
              { id: "objection_script", label: "Scripts" },
            ].map((cat) => (
              <Button
                key={cat.id}
                variant={selectedCategory === cat.id ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory(cat.id)}
                className="text-[11px] h-6 px-2.5 rounded-full shrink-0"
              >
                {cat.label}
              </Button>
            ))}
          </div>
        </SheetHeader>

        {/* Lista de Procedimentos */}
        <ScrollArea className="flex-1 p-4">
          {isLoading ? (
            <div className="py-20 text-center text-xs text-muted-foreground flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
              Carregando procedimentos...
            </div>
          ) : !procedures || procedures.length === 0 ? (
            <div className="py-16 text-center space-y-2">
              <FileText className="w-10 h-10 text-muted-foreground/40 mx-auto" />
              <p className="text-xs font-semibold text-foreground">Nenhum procedimento encontrado</p>
              <p className="text-[11px] text-muted-foreground max-w-xs mx-auto">
                {searchTerm
                  ? "Tente buscar com outros termos."
                  : "Nenhum procedimento ativo no Playbook da empresa."}
              </p>
            </div>
          ) : (
            <div className="space-y-3 pb-4">
              {procedures.map((item: any) => {
                const categoryBadgeColor =
                  {
                    procedure: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
                    faq: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30",
                    pricing: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
                    objection_script: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30",
                    policy: "bg-zinc-500/10 text-zinc-700 dark:text-zinc-300 border-zinc-500/30",
                  }[item.category as string] || "bg-muted text-muted-foreground";

                const categoryLabel =
                  {
                    procedure: "Procedimento",
                    faq: "FAQ",
                    pricing: "Preço",
                    objection_script: "Script",
                    policy: "Política",
                  }[item.category as string] || item.category;

                return (
                  <Card key={item.id} className="border-border/80 shadow-2xs hover:border-border transition-all">
                    <CardHeader className="p-3 pb-1.5 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="outline" className={cn("text-[9px] font-semibold px-1.5 py-0", categoryBadgeColor)}>
                          {categoryLabel}
                        </Badge>
                        {item.target_audience && (
                          <span className="text-[10px] text-muted-foreground truncate max-w-[150px]">
                            {item.target_audience}
                          </span>
                        )}
                      </div>
                      <CardTitle className="text-xs font-bold text-foreground">
                        {item.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0 space-y-2">
                      <p className="text-[11px] text-muted-foreground leading-relaxed whitespace-pre-wrap line-clamp-4 hover:line-clamp-none transition-all">
                        {item.content}
                      </p>

                      {item.key_points && item.key_points.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {item.key_points.slice(0, 3).map((pt: string, pIdx: number) => (
                            <span
                              key={pIdx}
                              className="text-[10px] bg-primary/5 text-primary px-1.5 py-0.5 rounded font-medium"
                            >
                              ✓ {pt}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="pt-2 border-t border-border/50 flex items-center justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(item.content)}
                          className="h-6 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
                        >
                          <Copy className="w-3 h-3" />
                          Copiar
                        </Button>
                        {onInsertText && (
                          <Button
                            size="sm"
                            onClick={() => handleInsert(item.content)}
                            className="h-6 px-2.5 text-[11px] gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                          >
                            <PlusCircle className="w-3 h-3" />
                            Inserir no Chat
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
