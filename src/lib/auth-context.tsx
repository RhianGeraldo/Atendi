import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { recordUserLoginAction, recordUserLogoutAction } from "@/lib/api/activity.functions";

function getTodayLocalDate(): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().split("T")[0];
  }
}

export interface Profile {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  role: "super_admin" | "admin_company" | "manager" | "agent";
  active?: boolean;
  company_id: string | null;
  has_matriz_access: boolean;
  department_id: string | null;
  use_signature?: boolean | null;
  custom_role_id?: string | null;
  allowed_menus?: string[] | null;
  custom_role?: {
    id: string;
    name: string;
    allowed_menus: string[];
    base_role: string;
  } | null;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (name: string, email: string, password: string, companyId?: string | null) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const timeoutId = setTimeout(() => {
      if (isMounted) {
        setLoading(false);
      }
    }, 8000);

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, s) => {
      if (s?.user) {
        const today = getTodayLocalDate();
        const storedDate = typeof window !== "undefined" ? localStorage.getItem("ATENDI_SESSION_DATE") : null;

        // Se o evento é SIGNED_IN (login realizado agora), assegura que a data de hoje está gravada
        if (event === "SIGNED_IN") {
          if (typeof window !== "undefined") {
            localStorage.setItem("ATENDI_SESSION_DATE", today);
          }
          setSession(s);
          setTimeout(() => loadProfile(s.user.id), 0);
          return;
        }

        // Para tokens renovados ou reconexões automáticas, checa se é de um dia anterior
        if (storedDate && storedDate !== today) {
          // Reset diário: sessão de dia anterior é encerrada silenciosamente
          if (typeof window !== "undefined") {
            localStorage.removeItem("ATENDI_SESSION_DATE");
          }
          await supabase.auth.signOut();
          setSession(null);
          setProfile(null);
          return;
        }

        if (typeof window !== "undefined" && !storedDate) {
          localStorage.setItem("ATENDI_SESSION_DATE", today);
        }

        setSession(s);
        // defer profile fetch
        setTimeout(() => loadProfile(s.user.id), 0);
      } else {
        setProfile(null);
      }
    });

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        const currentSession = data.session;
        if (currentSession?.user) {
          const today = getTodayLocalDate();
          const storedDate = typeof window !== "undefined" ? localStorage.getItem("ATENDI_SESSION_DATE") : null;

          // Se a sessão salva for de dia anterior, desloga silenciosamente
          if (storedDate && storedDate !== today) {
            if (typeof window !== "undefined") {
              localStorage.removeItem("ATENDI_SESSION_DATE");
            }
            await supabase.auth.signOut();
            setSession(null);
            setProfile(null);
            clearTimeout(timeoutId);
            if (isMounted) setLoading(false);
            return;
          }

          if (typeof window !== "undefined" && !storedDate) {
            localStorage.setItem("ATENDI_SESSION_DATE", today);
            recordUserLoginAction().catch(() => {});
          }

          setSession(currentSession);
          loadProfile(currentSession.user.id).finally(() => {
            clearTimeout(timeoutId);
            if (isMounted) setLoading(false);
          });
        } else {
          clearTimeout(timeoutId);
          if (isMounted) setLoading(false);
        }
      })
      .catch((err) => {
        console.warn("[Auth] Erro ao obter sessão:", err);
        clearTimeout(timeoutId);
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
      sub.subscription.unsubscribe();
    };
  }, []);

  async function loadProfile(userId: string) {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id,name,email,avatar_url,role,active,company_id,department_id,custom_role_id,allowed_menus,use_signature,custom_role:company_roles(id,name,allowed_menus,base_role)",
        )
        .eq("id", userId)
        .maybeSingle();
      if (error) {
        console.warn("[Auth] Erro ao carregar perfil:", error.message);
      }
      if (data) {
        // Se a conta estiver inativa/desativada e não for super_admin, desloga
        if (data.active === false && data.role !== "super_admin") {
          console.warn("[Auth] Conta desativada:", data.email);
          await supabase.from("profiles").update({ online: false }).eq("id", userId);
          await supabase.auth.signOut();
          setProfile(null);
          toast.error("Acesso bloqueado", {
            description: "Sua conta de usuário foi desativada pelo administrador. Entre em contato com a equipe.",
            duration: 8000,
          });
          return;
        }

        setProfile(data as unknown as Profile);
        // Atualiza status online no perfil
        supabase.from("profiles").update({ online: true }).eq("id", userId).then();
      }
    } catch (err: any) {
      console.warn("[Auth] Exceção ao carregar perfil:", err?.message);
    }
  }

  // Listener para marcar offline ao descarregar a janela/aba
  useEffect(() => {
    if (!session?.user?.id) return;
    const currentUserId = session.user.id;
    const handleUnload = () => {
      supabase.from("profiles").update({ online: false }).eq("id", currentUserId).then();
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => {
      window.removeEventListener("beforeunload", handleUnload);
    };
  }, [session?.user?.id]);

  // Listener para detectar virada de dia em tempo real e deslogar para novo expediente
  useEffect(() => {
    if (!session?.user?.id) return;

    const checkDayChange = () => {
      const today = getTodayLocalDate();
      const storedDate = typeof window !== "undefined" ? localStorage.getItem("ATENDI_SESSION_DATE") : null;
      if (storedDate && storedDate !== today) {
        if (typeof window !== "undefined") {
          localStorage.removeItem("ATENDI_SESSION_DATE");
        }
        supabase.auth.signOut().then(() => {
          setSession(null);
          setProfile(null);
        });
      }
    };

    const intervalId = setInterval(checkDayChange, 60_000);
    window.addEventListener("focus", checkDayChange);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener("focus", checkDayChange);
    };
  }, [session?.user?.id]);

  const value: AuthContextValue = {
    user: session?.user ?? null,
    session,
    profile,
    loading,
    async refreshProfile() {
      if (session?.user?.id) {
        await loadProfile(session.user.id);
      }
    },
    async signIn(email, password) {
      try {
        const today = getTodayLocalDate();
        if (typeof window !== "undefined") {
          localStorage.setItem("ATENDI_SESSION_DATE", today);
        }

        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          return { error: error.message };
        }

        // Registra o primeiro login do dia atômico
        recordUserLoginAction().catch((err) => {
          console.warn("[Auth] Falha ao registrar ponto de login:", err);
        });

        return { error: null };
      } catch (err: any) {
        console.error("[Auth] signIn error:", err);
        return { error: err?.message || "Erro ao realizar login. Tente novamente." };
      }
    },
    async signUp(name, email, password, companyId) {
      try {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              name,
              ...(companyId ? { company_id: companyId } : {})
            }
          }
        });
        return { error: error?.message ?? null };
      } catch (err: any) {
        console.error("[Auth] signUp error:", err);
        return { error: err?.message || "Erro ao criar conta. Tente novamente." };
      }
    },
    async signOut() {
      try {
        if (session?.user?.id) {
          recordUserLogoutAction().catch((e) => console.warn("[Auth] Falha ao registrar logout:", e));
          await supabase.from("profiles").update({ online: false }).eq("id", session.user.id);
        }
        if (typeof window !== "undefined") {
          localStorage.removeItem("ATENDI_SESSION_DATE");
          localStorage.removeItem("ATENDI_QUERY_CACHE");
          sessionStorage.removeItem("ATENDI_QUERY_CACHE");
        }
      } catch (e) {
        console.warn("[Auth] Failed to clear query cache or update status on sign out:", e);
      }
      await supabase.auth.signOut();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
