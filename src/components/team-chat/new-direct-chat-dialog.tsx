import React, { useState, useMemo } from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription 
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, MessageSquare, Loader2 } from "lucide-react";
import { initials } from "@/lib/format";
import { TeamMember } from "./team-chat-types";
import { useAuth } from "@/lib/auth-context";

interface NewDirectChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamMembers: TeamMember[];
  onSelectMember: (userId: string) => Promise<void> | void;
}

export function NewDirectChatDialog({
  open,
  onOpenChange,
  teamMembers,
  onSelectMember,
}: NewDirectChatDialogProps) {
  const { profile } = useAuth();
  const [search, setSearch] = useState("");
  const [loadingUserId, setLoadingUserId] = useState<string | null>(null);

  const filteredMembers = useMemo(() => {
    // Não lista o próprio usuário
    const others = teamMembers.filter((m) => m.id !== profile?.id);
    if (!search.trim()) return others;
    const term = search.toLowerCase().trim();
    return others.filter((m) => {
      const name = m.name?.toLowerCase() || "";
      const unitName = m.units?.map((u) => u.name.toLowerCase()).join(" ") || "";
      return name.includes(term) || unitName.includes(term);
    });
  }, [teamMembers, profile?.id, search]);

  const handleSelect = async (userId: string) => {
    if (loadingUserId) return;
    try {
      setLoadingUserId(userId);
      await onSelectMember(userId);
      setSearch("");
      onOpenChange(false);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingUserId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-2">
          <DialogTitle>Conversar com Colega</DialogTitle>
          <DialogDescription>
            Inicie uma conversa direta (1:1) com qualquer membro da equipe.
          </DialogDescription>

          <div className="relative mt-2">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou unidade..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 text-xs bg-muted/40"
            />
          </div>
        </DialogHeader>

        <ScrollArea className="h-[300px] px-3 pb-3">
          <div className="space-y-1">
            {filteredMembers.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                Nenhum colega encontrado com esse nome.
              </div>
            ) : (
              filteredMembers.map((member) => (
                <button
                  key={member.id}
                  disabled={!!loadingUserId}
                  onClick={() => handleSelect(member.id)}
                  className="flex items-center w-full gap-3 p-2 rounded-lg hover:bg-muted/70 disabled:opacity-50 transition-colors text-left group cursor-pointer"
                >
                  <div className="relative shrink-0">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={member.avatar_url || ""} />
                      <AvatarFallback className="text-xs">
                        {initials(member.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-emerald-500 border border-background" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-medium text-foreground truncate">
                        {member.name}
                      </span>
                      {member.units && member.units.length > 0 && (
                        <Badge
                          variant="outline"
                          className="text-[9px] px-1.5 py-0 h-4 text-muted-foreground bg-muted/30"
                        >
                          {member.units[0].name}
                        </Badge>
                      )}
                    </div>
                    {member.role && (
                      <p className="text-[11px] text-muted-foreground truncate capitalize">
                        {member.role.replace("_", " ")}
                      </p>
                    )}
                  </div>

                  {loadingUserId === member.id ? (
                    <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
                  ) : (
                    <MessageSquare className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  )}
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
