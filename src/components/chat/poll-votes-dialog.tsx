import React, { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StartConversationDialog } from "@/components/chat/start-conversation-dialog";
import { formatPhone, initials } from "@/lib/format";
import { cn, getPhoneVariants } from "@/lib/utils";
import {
  Users,
  Search,
  MessageSquarePlus,
  CheckCircle2,
  HelpCircle,
  ExternalLink,
} from "lucide-react";
import { format } from "date-fns";

export interface PollVoterInfo {
  voterKey?: string;
  voterJid?: string | null;
  voterLid?: string | null;
  voterPhone?: string | null;
  voterName?: string | null;
  selectedOptions?: string[];
  timestamp?: number;
}

interface PollVotesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pollName: string;
  options: string[];
  votes: Record<string, PollVoterInfo>;
  knownContactPhones?: Set<string>;
}

export function PollVotesDialog({
  open,
  onOpenChange,
  pollName,
  options,
  votes,
  knownContactPhones,
}: PollVotesDialogProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedOptionFilter, setSelectedOptionFilter] = useState<string | null>(null);
  const [activeCallVoter, setActiveCallVoter] = useState<{ phone: string; name: string } | null>(null);

  // Lista de todos os votantes válidos (que possuem ao menos uma opção marcada)
  const voterList = useMemo(() => {
    return Object.values(votes || {}).filter(
      (v) => Array.isArray(v.selectedOptions) && v.selectedOptions.length > 0,
    );
  }, [votes]);

  // Função auxiliar para verificar se o telefone está na base de contatos da empresa
  const checkPhoneInBase = (phoneStr?: string | null): boolean => {
    if (!phoneStr || !knownContactPhones) return false;
    const clean = phoneStr.replace(/\D/g, "");
    if (!clean) return false;

    if (knownContactPhones.has(clean)) return true;
    const raw = clean.startsWith("55") ? clean : "55" + clean;
    if (knownContactPhones.has(raw) || knownContactPhones.has(raw.slice(2))) return true;

    const variants = getPhoneVariants(raw);
    return variants.some((v) => knownContactPhones.has(v));
  };

  // Filtragem por busca e por opção escolhida
  const filteredVoters = useMemo(() => {
    return voterList.filter((voter) => {
      const name = (voter.voterName || "").toLowerCase();
      const phone = (voter.voterPhone || "").replace(/\D/g, "");
      const search = searchTerm.trim().toLowerCase();
      const searchDigits = search.replace(/\D/g, "");

      const matchesSearch =
        !search ||
        name.includes(search) ||
        (searchDigits && phone.includes(searchDigits));

      const matchesOption =
        !selectedOptionFilter ||
        voter.selectedOptions?.includes(selectedOptionFilter);

      return matchesSearch && matchesOption;
    });
  }, [voterList, searchTerm, selectedOptionFilter]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl md:max-w-3xl w-full p-0 gap-0 overflow-hidden flex flex-col h-[85vh] max-h-[740px]">
        <DialogHeader className="p-5 pb-3.5 border-b bg-muted/20">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary shrink-0 mt-0.5">
              <Users className="h-5 w-5" />
            </div>
            <div className="flex flex-col flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <DialogTitle className="text-base sm:text-lg font-semibold leading-tight">
                  Votos da Enquete
                </DialogTitle>
                <Badge variant="secondary" className="text-xs px-2.5 py-0.5 font-medium shrink-0">
                  {voterList.length} {voterList.length === 1 ? "voto registrado" : "votos registrados"}
                </Badge>
              </div>
              <DialogDescription className="text-xs sm:text-sm text-foreground/80 font-medium mt-1 leading-snug break-words">
                {pollName}
              </DialogDescription>
            </div>
          </div>

          {/* Filtros rápidos por opção */}
          <div className="flex items-center gap-1.5 overflow-x-auto pt-3 pb-1 no-scrollbar">
            <Button
              type="button"
              size="sm"
              variant={selectedOptionFilter === null ? "default" : "outline"}
              onClick={() => setSelectedOptionFilter(null)}
              className="h-7 px-3 text-xs rounded-full shrink-0 font-medium"
            >
              Todas as opções ({voterList.length})
            </Button>
            {options.map((opt) => {
              const count = voterList.filter((v) => v.selectedOptions?.includes(opt)).length;
              const isSelected = selectedOptionFilter === opt;
              return (
                <Button
                  key={opt}
                  type="button"
                  size="sm"
                  variant={isSelected ? "default" : "outline"}
                  onClick={() => setSelectedOptionFilter(isSelected ? null : opt)}
                  className="h-7 px-3 text-xs rounded-full shrink-0 max-w-[240px] font-medium"
                >
                  <span className="truncate">{opt}</span>
                  <span className="ml-1.5 opacity-70">({count})</span>
                </Button>
              );
            })}
          </div>

          {/* Campo de pesquisa */}
          <div className="relative mt-2.5">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Buscar votante por nome ou telefone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-9 pl-9 text-xs sm:text-sm bg-background"
            />
          </div>
        </DialogHeader>

        {/* Lista de Votantes */}
        <ScrollArea className="flex-1 overflow-y-auto p-4 sm:p-5">
          {filteredVoters.length === 0 ? (
            <div className="py-16 flex flex-col items-center justify-center text-center text-muted-foreground">
              <HelpCircle className="h-10 w-10 mb-2.5 opacity-40" />
              <p className="text-sm font-semibold">Nenhum votante encontrado</p>
              <p className="text-xs opacity-70 mt-1 max-w-[280px]">
                {searchTerm || selectedOptionFilter
                  ? "Tente alterar os filtros ou o termo de busca."
                  : "Ainda não há votos registrados para esta enquete."}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filteredVoters.map((voter) => {
                const phone = voter.voterPhone || "";
                const inBase = checkPhoneInBase(phone);
                const name = voter.voterName || (phone ? formatPhone(phone) : "Participante");
                const cleanPhone = phone.replace(/\D/g, "");

                return (
                  <div
                    key={voter.voterKey || voter.voterJid || phone}
                    className="p-3 sm:p-3.5 rounded-xl border border-border/50 bg-card hover:bg-muted/30 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
                  >
                    <div className="flex items-start sm:items-center gap-3 min-w-0">
                      <Avatar className="h-10 w-10 shrink-0 border border-border/60">
                        <AvatarFallback className="text-xs sm:text-sm font-semibold bg-muted text-foreground">
                          {initials(name)}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-xs sm:text-sm text-foreground truncate max-w-[200px] sm:max-w-[260px]">
                            {name}
                          </span>
                          {inBase ? (
                            <Badge
                              variant="outline"
                              className="h-4.5 px-1.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 shrink-0 flex items-center gap-1"
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              Na base
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="h-4.5 px-1.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 shrink-0"
                            >
                              Não cadastrado
                            </Badge>
                          )}
                        </div>

                        {phone && (
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-muted-foreground font-mono">
                              {formatPhone(phone)}
                            </span>
                            {cleanPhone && (
                              <a
                                href={`https://wa.me/${cleanPhone}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Abrir conversa no WhatsApp"
                                className="text-muted-foreground/60 hover:text-primary transition-colors flex items-center gap-0.5 text-[11px]"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        )}

                        {/* Opções votadas */}
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {voter.selectedOptions?.map((opt) => (
                            <span
                              key={opt}
                              className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-primary/10 text-primary border border-primary/20 max-w-[280px] sm:max-w-[360px] truncate"
                              title={opt}
                            >
                              {opt}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Ação: Chamar ou Conversar */}
                    <div className="shrink-0 flex items-center gap-2 self-end sm:self-center pt-1 sm:pt-0 border-t sm:border-t-0 border-border/30 w-full sm:w-auto justify-end">
                      {cleanPhone && (
                        <Button
                          size="sm"
                          variant={inBase ? "outline" : "default"}
                          onClick={() =>
                            setActiveCallVoter({
                              phone: cleanPhone,
                              name: voter.voterName || "",
                            })
                          }
                          className={cn(
                            "h-8 text-xs px-3 gap-1.5 font-semibold shadow-xs w-full sm:w-auto",
                            inBase && "hover:bg-muted font-medium text-foreground",
                          )}
                        >
                          <MessageSquarePlus
                            className={cn("h-3.5 w-3.5", inBase ? "text-muted-foreground" : "")}
                          />
                          <span>{inBase ? "Conversar" : "+ Chamar"}</span>
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* Diálogo único para iniciar conversa / cadastrar contato */}
        {activeCallVoter && (
          <StartConversationDialog
            open={Boolean(activeCallVoter)}
            onOpenChange={(isOpen) => {
              if (!isOpen) setActiveCallVoter(null);
            }}
            initialPhone={activeCallVoter.phone}
            contactName={activeCallVoter.name}
            onCreated={() => {
              setActiveCallVoter(null);
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
