import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export interface Profile {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  role: "super_admin" | "admin_company" | "manager" | "agent";
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

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        // defer profile fetch
        setTimeout(() => loadProfile(s.user.id), 0);
      } else {
        setProfile(null);
      }
    });

    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session);
        if (data.session?.user) {
          loadProfile(data.session.user.id).finally(() => {
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
          "id,name,email,avatar_url,role,company_id,department_id,custom_role_id,allowed_menus,use_signature,custom_role:company_roles(id,name,allowed_menus,base_role)",
        )
        .eq("id", userId)
        .maybeSingle();
      if (error) {
        console.warn("[Auth] Erro ao carregar perfil:", error.message);
      }
      if (data) {
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
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error: error?.message ?? null };
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
          await supabase.from("profiles").update({ online: false }).eq("id", session.user.id);
        }
        if (typeof window !== "undefined") {
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
