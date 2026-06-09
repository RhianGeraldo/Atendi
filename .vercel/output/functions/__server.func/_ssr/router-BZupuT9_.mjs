import { b as QueryClient } from "../_libs/tanstack__query-core.mjs";
import { Q as QueryClientProvider } from "../_libs/tanstack__react-query.mjs";
import { c as createRouter, a as createRootRouteWithContext, u as useRouter, L as Link, O as Outlet, H as HeadContent, S as Scripts, b as createFileRoute, l as lazyRouteComponent } from "../_libs/tanstack__react-router.mjs";
import { r as reactExports, j as jsxRuntimeExports } from "../_libs/react.mjs";
import { T as Toaster$1 } from "../_libs/sonner.mjs";
import { s as supabase } from "./client-B4adl69c.mjs";
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
import "../_libs/supabase__supabase-js.mjs";
import "../_libs/supabase__postgrest-js.mjs";
import "../_libs/supabase__realtime-js.mjs";
import "../_libs/supabase__phoenix.mjs";
import "../_libs/supabase__storage-js.mjs";
import "../_libs/iceberg-js.mjs";
import "../_libs/supabase__auth-js.mjs";
import "tslib";
import "../_libs/supabase__functions-js.mjs";
const appCss = "/assets/styles-Cb8YmVWw.css";
function reportLovableError(error, context = {}) {
  if (typeof window === "undefined") return;
  window.__lovableEvents?.captureException?.(
    error,
    {
      source: "react_error_boundary",
      route: window.location.pathname,
      ...context
    },
    {
      mechanism: "react_error_boundary",
      handled: false,
      severity: "error"
    }
  );
}
const Toaster = ({ ...props }) => {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    Toaster$1,
    {
      className: "toaster group",
      toastOptions: {
        classNames: {
          toast: "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground"
        }
      },
      ...props
    }
  );
};
const AuthContext = reactExports.createContext(void 0);
function AuthProvider({ children }) {
  const [session, setSession] = reactExports.useState(null);
  const [profile, setProfile] = reactExports.useState(null);
  const [loading, setLoading] = reactExports.useState(true);
  reactExports.useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        setTimeout(() => loadProfile(s.user.id), 0);
      } else {
        setProfile(null);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        loadProfile(data.session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  async function loadProfile(userId) {
    const { data } = await supabase.from("profiles").select("id,name,email,avatar_url,role,company_id,department_id").eq("id", userId).maybeSingle();
    if (data) setProfile(data);
  }
  const value = {
    user: session?.user ?? null,
    session,
    profile,
    loading,
    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error?.message ?? null };
    },
    async signUp(name, email, password, companyId) {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name,
            ...companyId ? { company_id: companyId } : {}
          }
        }
      });
      return { error: error?.message ?? null };
    },
    async signOut() {
      await supabase.auth.signOut();
    }
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx(AuthContext.Provider, { value, children });
}
function useAuth() {
  const ctx = reactExports.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
const UnitContext = reactExports.createContext(void 0);
function UnitProvider({ children }) {
  const { profile } = useAuth();
  const [selectedUnitId, setSelectedUnitIdState] = reactExports.useState(() => {
    if (typeof window === "undefined") return null;
    const saved = localStorage.getItem("omni_selected_unit_id");
    return saved ? saved : null;
  });
  const setSelectedUnitId = (id) => {
    setSelectedUnitIdState(id);
    if (typeof window !== "undefined") {
      if (id) {
        localStorage.setItem("omni_selected_unit_id", id);
      } else {
        localStorage.removeItem("omni_selected_unit_id");
      }
    }
  };
  reactExports.useEffect(() => {
    if (!profile) {
      setSelectedUnitId(null);
    }
  }, [profile]);
  return /* @__PURE__ */ jsxRuntimeExports.jsx(UnitContext.Provider, { value: { selectedUnitId, setSelectedUnitId }, children });
}
function useUnit() {
  const context = reactExports.useContext(UnitContext);
  if (context === void 0) {
    throw new Error("useUnit must be used within a UnitProvider");
  }
  return context;
}
function NotFoundComponent() {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex min-h-screen items-center justify-center bg-background px-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "max-w-md text-center", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-7xl font-bold text-foreground", children: "404" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "mt-4 text-xl font-semibold text-foreground", children: "Página não encontrada" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-sm text-muted-foreground", children: "A página que você procura não existe ou foi movida." }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-6", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      Link,
      {
        to: "/",
        className: "inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90",
        children: "Voltar ao início"
      }
    ) })
  ] }) });
}
function ErrorComponent({ error, reset }) {
  console.error(error);
  const router2 = useRouter();
  reactExports.useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex min-h-screen items-center justify-center bg-background px-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "max-w-md text-center", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-xl font-semibold tracking-tight text-foreground", children: "Algo deu errado" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-sm text-muted-foreground", children: "Tente novamente ou volte ao início." }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-6 flex flex-wrap justify-center gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: () => {
            router2.invalidate();
            reset();
          },
          className: "inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90",
          children: "Tentar novamente"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "a",
        {
          href: "/",
          className: "inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent",
          children: "Início"
        }
      )
    ] })
  ] }) });
}
const Route$c = createRootRouteWithContext()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Omni — Atendimento e CRM" },
      { name: "description", content: "Plataforma de atendimento omnichannel com CRM integrado." }
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" }
    ]
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent
});
function RootShell({ children }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("html", { lang: "pt-BR", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("head", { children: /* @__PURE__ */ jsxRuntimeExports.jsx(HeadContent, {}) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("body", { children: [
      children,
      /* @__PURE__ */ jsxRuntimeExports.jsx(Scripts, {})
    ] })
  ] });
}
function RootComponent() {
  const { queryClient } = Route$c.useRouteContext();
  return /* @__PURE__ */ jsxRuntimeExports.jsx(QueryClientProvider, { client: queryClient, children: /* @__PURE__ */ jsxRuntimeExports.jsx(AuthProvider, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(UnitProvider, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(Outlet, {}),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Toaster, { richColors: true, position: "top-right" })
  ] }) }) });
}
const $$splitComponentImporter$b = () => import("./auth-Bpi74kD7.mjs");
const Route$b = createFileRoute("/auth")({
  component: lazyRouteComponent($$splitComponentImporter$b, "component")
});
const $$splitComponentImporter$a = () => import("./route-Br9kGPsC.mjs");
const Route$a = createFileRoute("/_authenticated")({
  ssr: false,
  component: lazyRouteComponent($$splitComponentImporter$a, "component")
});
const $$splitComponentImporter$9 = () => import("./index-BkYIj6LT.mjs");
const Route$9 = createFileRoute("/")({
  component: lazyRouteComponent($$splitComponentImporter$9, "component")
});
const $$splitComponentImporter$8 = () => import("./units-DHFD7va5.mjs");
const Route$8 = createFileRoute("/_authenticated/units")({
  component: lazyRouteComponent($$splitComponentImporter$8, "component")
});
const $$splitComponentImporter$7 = () => import("./tasks-BfK_i5x5.mjs");
const Route$7 = createFileRoute("/_authenticated/tasks")({
  component: lazyRouteComponent($$splitComponentImporter$7, "component")
});
const $$splitComponentImporter$6 = () => import("./settings-C850_7dy.mjs");
const Route$6 = createFileRoute("/_authenticated/settings")({
  component: lazyRouteComponent($$splitComponentImporter$6, "component")
});
const $$splitComponentImporter$5 = () => import("./reports-CN1MC3a_.mjs");
const Route$5 = createFileRoute("/_authenticated/reports")({
  component: lazyRouteComponent($$splitComponentImporter$5, "component")
});
const $$splitComponentImporter$4 = () => import("./pipeline-DWprK8fa.mjs");
const Route$4 = createFileRoute("/_authenticated/pipeline")({
  component: lazyRouteComponent($$splitComponentImporter$4, "component")
});
const $$splitComponentImporter$3 = () => import("./dashboard-BBT81qpO.mjs");
const Route$3 = createFileRoute("/_authenticated/dashboard")({
  component: lazyRouteComponent($$splitComponentImporter$3, "component")
});
const $$splitComponentImporter$2 = () => import("./conversations-Ci5qP5AG.mjs");
const Route$2 = createFileRoute("/_authenticated/conversations")({
  component: lazyRouteComponent($$splitComponentImporter$2, "component"),
  validateSearch: (search) => {
    return {
      c: search.c,
      tab: search.tab
    };
  }
});
const $$splitComponentImporter$1 = () => import("./contacts-CndHydZB.mjs");
const Route$1 = createFileRoute("/_authenticated/contacts")({
  component: lazyRouteComponent($$splitComponentImporter$1, "component")
});
const $$splitComponentImporter = () => import("./campaigns-2L42iqWI.mjs");
const Route = createFileRoute("/_authenticated/campaigns")({
  component: lazyRouteComponent($$splitComponentImporter, "component")
});
const AuthRoute = Route$b.update({
  id: "/auth",
  path: "/auth",
  getParentRoute: () => Route$c
});
const AuthenticatedRouteRoute = Route$a.update({
  id: "/_authenticated",
  getParentRoute: () => Route$c
});
const IndexRoute = Route$9.update({
  id: "/",
  path: "/",
  getParentRoute: () => Route$c
});
const AuthenticatedUnitsRoute = Route$8.update({
  id: "/units",
  path: "/units",
  getParentRoute: () => AuthenticatedRouteRoute
});
const AuthenticatedTasksRoute = Route$7.update({
  id: "/tasks",
  path: "/tasks",
  getParentRoute: () => AuthenticatedRouteRoute
});
const AuthenticatedSettingsRoute = Route$6.update({
  id: "/settings",
  path: "/settings",
  getParentRoute: () => AuthenticatedRouteRoute
});
const AuthenticatedReportsRoute = Route$5.update({
  id: "/reports",
  path: "/reports",
  getParentRoute: () => AuthenticatedRouteRoute
});
const AuthenticatedPipelineRoute = Route$4.update({
  id: "/pipeline",
  path: "/pipeline",
  getParentRoute: () => AuthenticatedRouteRoute
});
const AuthenticatedDashboardRoute = Route$3.update({
  id: "/dashboard",
  path: "/dashboard",
  getParentRoute: () => AuthenticatedRouteRoute
});
const AuthenticatedConversationsRoute = Route$2.update({
  id: "/conversations",
  path: "/conversations",
  getParentRoute: () => AuthenticatedRouteRoute
});
const AuthenticatedContactsRoute = Route$1.update({
  id: "/contacts",
  path: "/contacts",
  getParentRoute: () => AuthenticatedRouteRoute
});
const AuthenticatedCampaignsRoute = Route.update({
  id: "/campaigns",
  path: "/campaigns",
  getParentRoute: () => AuthenticatedRouteRoute
});
const AuthenticatedRouteRouteChildren = {
  AuthenticatedCampaignsRoute,
  AuthenticatedContactsRoute,
  AuthenticatedConversationsRoute,
  AuthenticatedDashboardRoute,
  AuthenticatedPipelineRoute,
  AuthenticatedReportsRoute,
  AuthenticatedSettingsRoute,
  AuthenticatedTasksRoute,
  AuthenticatedUnitsRoute
};
const AuthenticatedRouteRouteWithChildren = AuthenticatedRouteRoute._addFileChildren(AuthenticatedRouteRouteChildren);
const rootRouteChildren = {
  IndexRoute,
  AuthenticatedRouteRoute: AuthenticatedRouteRouteWithChildren,
  AuthRoute
};
const routeTree = Route$c._addFileChildren(rootRouteChildren)._addFileTypes();
const getRouter = () => {
  const queryClient = new QueryClient();
  const router2 = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0
  });
  return router2;
};
const router = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  getRouter
}, Symbol.toStringTag, { value: "Module" }));
export {
  Route$2 as R,
  useUnit as a,
  router as r,
  useAuth as u
};
