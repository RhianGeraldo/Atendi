import { r as reactExports, j as jsxRuntimeExports } from "../_libs/react.mjs";
import { d as useNavigate } from "../_libs/tanstack__react-router.mjs";
import { t as toast } from "../_libs/sonner.mjs";
import { B as Button } from "./button-DA2gxxPy.mjs";
import { I as Input } from "./input-C0QjszdI.mjs";
import { L as Label } from "./label-JU3yqRBo.mjs";
import { C as Card } from "./card-t5bxWKAo.mjs";
import { u as useAuth } from "./router-BZupuT9_.mjs";
import { M as MessageSquare } from "../_libs/lucide-react.mjs";
import "../_libs/tanstack__router-core.mjs";
import "../_libs/tanstack__history.mjs";
import "../_libs/cookie-es.mjs";
import "../_libs/seroval.mjs";
import "../_libs/seroval-plugins.mjs";
import "node:stream/web";
import "node:stream";
import "../_libs/react-dom.mjs";
import "util";
import "crypto";
import "async_hooks";
import "stream";
import "../_libs/isbot.mjs";
import "../_libs/radix-ui__react-slot.mjs";
import "../_libs/radix-ui__react-compose-refs.mjs";
import "../_libs/class-variance-authority.mjs";
import "../_libs/clsx.mjs";
import "./utils-H80jjgLf.mjs";
import "../_libs/tailwind-merge.mjs";
import "../_libs/radix-ui__react-label.mjs";
import "../_libs/radix-ui__react-primitive.mjs";
import "../_libs/tanstack__query-core.mjs";
import "../_libs/tanstack__react-query.mjs";
import "./client-B4adl69c.mjs";
import "../_libs/supabase__supabase-js.mjs";
import "../_libs/supabase__postgrest-js.mjs";
import "../_libs/supabase__realtime-js.mjs";
import "../_libs/supabase__phoenix.mjs";
import "../_libs/supabase__storage-js.mjs";
import "../_libs/iceberg-js.mjs";
import "../_libs/supabase__auth-js.mjs";
import "tslib";
import "../_libs/supabase__functions-js.mjs";
function AuthPage() {
  const {
    signIn,
    signUp,
    session,
    loading
  } = useAuth();
  const navigate = useNavigate();
  const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const companyId = searchParams.get("company");
  const [isRegister, setIsRegister] = reactExports.useState(!!companyId);
  const [name, setName] = reactExports.useState("");
  const [email, setEmail] = reactExports.useState(isRegister ? "" : "admin@demo.com");
  const [password, setPassword] = reactExports.useState(isRegister ? "" : "demo1234");
  const [submitting, setSubmitting] = reactExports.useState(false);
  reactExports.useEffect(() => {
    if (!loading && session) navigate({
      to: "/dashboard",
      replace: true
    });
  }, [session, loading, navigate]);
  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    if (isRegister) {
      const {
        error
      } = await signUp(name, email, password, companyId);
      setSubmitting(false);
      if (error) toast.error("Falha no cadastro", {
        description: error
      });
      else toast.success("Conta criada! Você já pode entrar.");
    } else {
      const {
        error
      } = await signIn(email, password);
      setSubmitting(false);
      if (error) toast.error("Falha no login", {
        description: error
      });
      else toast.success("Bem-vindo!");
    }
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid min-h-screen lg:grid-cols-2", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-lg font-semibold", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground", children: /* @__PURE__ */ jsxRuntimeExports.jsx(MessageSquare, { className: "h-5 w-5" }) }),
        "Omni"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-3xl font-semibold leading-tight", children: "Atendimento omnichannel com CRM integrado." }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-sidebar-foreground/70", children: "Centralize WhatsApp e Instagram, organize equipes por unidade e transforme conversas em oportunidades de venda." })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs text-sidebar-foreground/50", children: [
        "© ",
        (/* @__PURE__ */ new Date()).getFullYear(),
        " Grupo Exemplo"
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-center bg-background p-6", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { className: "w-full max-w-sm border-border p-8 shadow-sm", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-6", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-2xl font-semibold", children: isRegister ? "Criar conta" : "Entrar na plataforma" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-sm text-muted-foreground", children: isRegister ? companyId ? "Você foi convidado para participar de uma empresa." : "Crie sua conta para começar." : "Use suas credenciais para acessar." })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit: handleSubmit, className: "space-y-4", children: [
        isRegister && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { htmlFor: "name", children: "Nome completo" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { id: "name", type: "text", required: true, value: name, onChange: (e) => setName(e.target.value) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { htmlFor: "email", children: "E-mail" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { id: "email", type: "email", autoComplete: "email", required: true, value: email, onChange: (e) => setEmail(e.target.value) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { htmlFor: "password", children: "Senha" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { id: "password", type: "password", autoComplete: isRegister ? "new-password" : "current-password", required: true, value: password, onChange: (e) => setPassword(e.target.value) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { type: "submit", className: "w-full", disabled: submitting, children: submitting ? "Aguarde..." : isRegister ? "Cadastrar" : "Entrar" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-6 text-center text-sm text-muted-foreground", children: [
        isRegister ? "Já possui uma conta?" : "Ainda não tem uma conta?",
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => setIsRegister(!isRegister), className: "ml-1 font-medium text-primary hover:underline", children: isRegister ? "Faça login" : "Cadastre-se" })
      ] }),
      !isRegister && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-6 rounded-md bg-muted p-3 text-xs text-muted-foreground", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { className: "text-foreground", children: "Conta de demonstração:" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("br", {}),
        "admin@demo.com / demo1234"
      ] })
    ] }) })
  ] });
}
export {
  AuthPage as component
};
