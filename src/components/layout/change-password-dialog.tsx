import { useEffect, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

const MIN_LENGTH = 8;

/**
 * Trocar a própria senha. Abre sozinho quando a conta foi criada com senha temporária
 * (user_metadata.must_change_password, ex: usuário criado pelo MCP).
 */
export function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user } = useAuth();
  const mustChange = Boolean(user?.user_metadata?.must_change_password);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  // Primeiro acesso com senha temporária: pede a troca logo ao entrar
  useEffect(() => {
    if (mustChange) onOpenChange(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mustChange]);

  useEffect(() => {
    if (!open) {
      setPassword("");
      setConfirm("");
    }
  }, [open]);

  const error =
    password && password.length < MIN_LENGTH
      ? `A senha precisa ter pelo menos ${MIN_LENGTH} caracteres.`
      : confirm && confirm !== password
        ? "As senhas não são iguais."
        : null;

  const handleSave = async () => {
    if (saving || error || !password || password !== confirm) return;
    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({
      password,
      data: { must_change_password: false },
    });
    setSaving(false);
    if (updateError) {
      toast.error("Não foi possível trocar a senha", { description: updateError.message });
      return;
    }
    toast.success("Senha alterada com sucesso!");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            Trocar senha
          </DialogTitle>
          <DialogDescription className="text-xs">
            {mustChange
              ? "Você entrou com uma senha temporária. Crie uma senha sua para continuar usando o sistema."
              : "Crie uma nova senha para entrar no sistema."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold">Nova senha</label>
            <Input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold">Confirmar nova senha</label>
            <Input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              className="text-xs"
            />
          </div>
          {error && <p className="text-[11px] text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => onOpenChange(false)}
          >
            {mustChange ? "Depois" : "Cancelar"}
          </Button>
          <Button
            size="sm"
            className="text-xs gap-1.5"
            onClick={handleSave}
            disabled={saving || !!error || !password || password !== confirm}
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Salvar senha
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
