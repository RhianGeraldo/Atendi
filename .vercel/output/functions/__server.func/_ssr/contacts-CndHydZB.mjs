import { r as reactExports, j as jsxRuntimeExports } from "../_libs/react.mjs";
import { u as useQuery } from "../_libs/tanstack__react-query.mjs";
import { s as supabase } from "./client-B4adl69c.mjs";
import { u as useAuth, a as useUnit } from "./router-BZupuT9_.mjs";
import { C as Card, a as CardHeader, b as CardTitle, d as CardDescription, c as CardContent } from "./card-t5bxWKAo.mjs";
import { I as Input } from "./input-C0QjszdI.mjs";
import { B as Badge } from "./tabs-DaV-6sV-.mjs";
import { C as ContactDetailsSheet } from "./contact-details-sheet-D-N6IO0A.mjs";
import "../_libs/sonner.mjs";
import { i as Search, H as LoaderCircle, r as User, v as Phone, aa as Mail, t as Building } from "../_libs/lucide-react.mjs";
import { f as format, p as ptBR } from "../_libs/date-fns.mjs";
import "../_libs/tanstack__query-core.mjs";
import "../_libs/supabase__supabase-js.mjs";
import "../_libs/supabase__postgrest-js.mjs";
import "../_libs/supabase__realtime-js.mjs";
import "../_libs/supabase__phoenix.mjs";
import "../_libs/supabase__storage-js.mjs";
import "../_libs/iceberg-js.mjs";
import "../_libs/supabase__auth-js.mjs";
import "tslib";
import "../_libs/supabase__functions-js.mjs";
import "../_libs/tanstack__react-router.mjs";
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
import "./utils-H80jjgLf.mjs";
import "../_libs/clsx.mjs";
import "../_libs/tailwind-merge.mjs";
import "../_libs/class-variance-authority.mjs";
import "../_libs/radix-ui__react-dialog.mjs";
import "../_libs/radix-ui__primitive.mjs";
import "../_libs/radix-ui__react-compose-refs.mjs";
import "../_libs/radix-ui__react-context.mjs";
import "../_libs/radix-ui__react-id.mjs";
import "../_libs/@radix-ui/react-use-layout-effect+[...].mjs";
import "../_libs/@radix-ui/react-use-controllable-state+[...].mjs";
import "../_libs/@radix-ui/react-dismissable-layer+[...].mjs";
import "../_libs/radix-ui__react-primitive.mjs";
import "../_libs/radix-ui__react-slot.mjs";
import "../_libs/@radix-ui/react-use-callback-ref+[...].mjs";
import "../_libs/@radix-ui/react-use-escape-keydown+[...].mjs";
import "../_libs/radix-ui__react-focus-scope.mjs";
import "../_libs/radix-ui__react-portal.mjs";
import "../_libs/radix-ui__react-presence.mjs";
import "../_libs/radix-ui__react-focus-guards.mjs";
import "../_libs/react-remove-scroll.mjs";
import "../_libs/react-remove-scroll-bar.mjs";
import "../_libs/react-style-singleton.mjs";
import "../_libs/get-nonce.mjs";
import "../_libs/use-sidecar.mjs";
import "../_libs/use-callback-ref.mjs";
import "../_libs/aria-hidden.mjs";
import "../_libs/radix-ui__react-tabs.mjs";
import "../_libs/radix-ui__react-roving-focus.mjs";
import "../_libs/radix-ui__react-collection.mjs";
import "../_libs/radix-ui__react-direction.mjs";
import "./sheet-DiuHGwRv.mjs";
import "../_libs/radix-ui__react-scroll-area.mjs";
import "../_libs/radix-ui__number.mjs";
import "../_libs/radix-ui__react-separator.mjs";
import "./label-JU3yqRBo.mjs";
import "../_libs/radix-ui__react-label.mjs";
import "./button-DA2gxxPy.mjs";
import "./opportunity-dialog-De0nOeSk.mjs";
import "./command-P2Bojk4p.mjs";
import "../_libs/radix-ui__react-select.mjs";
import "../_libs/radix-ui__react-popper.mjs";
import "../_libs/floating-ui__react-dom.mjs";
import "../_libs/floating-ui__dom.mjs";
import "../_libs/floating-ui__core.mjs";
import "../_libs/floating-ui__utils.mjs";
import "../_libs/radix-ui__react-arrow.mjs";
import "../_libs/radix-ui__react-use-size.mjs";
import "../_libs/radix-ui__react-use-previous.mjs";
import "../_libs/@radix-ui/react-visually-hidden+[...].mjs";
import "../_libs/radix-ui__react-popover.mjs";
import "../_libs/cmdk.mjs";
function ContactsPage() {
  const {
    profile
  } = useAuth();
  const {
    selectedUnitId
  } = useUnit();
  const [searchTerm, setSearchTerm] = reactExports.useState("");
  const [selectedContactId, setSelectedContactId] = reactExports.useState(null);
  const {
    data: contacts,
    isLoading
  } = useQuery({
    queryKey: ["contacts", profile?.company_id, searchTerm, selectedUnitId],
    enabled: !!profile?.company_id,
    queryFn: async () => {
      const relation = selectedUnitId ? "conversations!inner" : "conversations";
      let query = supabase.from("contacts").select(`
          *,
          ${relation} (
            unit_id,
            units ( name ),
            started_at
          )
        `).eq("company_id", profile.company_id).order("created_at", {
        ascending: false
      });
      if (selectedUnitId) {
        query = query.eq("conversations.unit_id", selectedUnitId);
      }
      if (searchTerm) {
        query = query.or(`name.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%`);
      }
      const {
        data,
        error
      } = await query;
      if (error) throw error;
      return data.filter((c) => !c.phone || c.phone.length <= 15).map((c) => {
        const sortedConvs = (c.conversations || []).sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
        const lastConv = sortedConvs[0];
        return {
          ...c,
          last_unit_name: lastConv?.units?.name
        };
      });
    }
  });
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 space-y-4 p-4 md:p-8 pt-6", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-between space-y-2", children: /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-3xl font-bold tracking-tight", children: "Gestão de Contatos" }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(CardHeader, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(CardTitle, { children: "Contatos" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(CardDescription, { children: "Lista de todos os contatos que interagiram com a sua empresa." }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-4 flex items-center space-x-2", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative flex-1 max-w-sm", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Search, { className: "absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { placeholder: "Buscar por nome ou telefone...", className: "pl-9", value: searchTerm, onChange: (e) => setSearchTerm(e.target.value) })
        ] }) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(CardContent, { children: isLoading ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex justify-center p-8", children: /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-6 w-6 animate-spin text-muted-foreground" }) }) : contacts && contacts.length > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-md border", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-sm", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b bg-muted/50", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "h-10 px-4 text-left font-medium", children: "Nome" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "h-10 px-4 text-left font-medium", children: "Contato" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "h-10 px-4 text-left font-medium hidden md:table-cell", children: "Tags" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "h-10 px-4 text-left font-medium hidden sm:table-cell", children: "Data de Cadastro" })
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { children: contacts.map((contact) => /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b last:border-0 hover:bg-muted/50 cursor-pointer", onClick: () => setSelectedContactId(contact.id), children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "p-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-8 w-8 items-center justify-center rounded-full bg-primary/10", children: /* @__PURE__ */ jsxRuntimeExports.jsx(User, { className: "h-4 w-4 text-primary" }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-medium", children: contact.name })
          ] }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("td", { className: "p-4", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col gap-1 text-muted-foreground", children: [
              contact.phone && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Phone, { className: "h-3 w-3" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: contact.phone })
              ] }),
              contact.email && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Mail, { className: "h-3 w-3" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "truncate max-w-[150px]", children: contact.email })
              ] }),
              !contact.phone && !contact.email && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "-" })
            ] }),
            !selectedUnitId && contact.last_unit_name && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 mt-2 text-[10px] font-medium px-2 py-0.5 rounded bg-muted/60 text-muted-foreground w-fit", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Building, { className: "h-3 w-3 shrink-0" }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "truncate", children: [
                "Última unid: ",
                contact.last_unit_name
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "p-4 hidden md:table-cell", children: contact.tags && contact.tags.length > 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap gap-1", children: [
            contact.tags.slice(0, 2).map((tag) => /* @__PURE__ */ jsxRuntimeExports.jsx(Badge, { variant: "secondary", className: "text-[10px]", children: tag }, tag)),
            contact.tags.length > 2 && /* @__PURE__ */ jsxRuntimeExports.jsxs(Badge, { variant: "outline", className: "text-[10px]", children: [
              "+",
              contact.tags.length - 2
            ] })
          ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-muted-foreground", children: "-" }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "p-4 hidden sm:table-cell text-muted-foreground", children: format(new Date(contact.created_at), "dd/MM/yyyy", {
            locale: ptBR
          }) })
        ] }, contact.id)) })
      ] }) }) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-col items-center justify-center py-12 text-center", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-full bg-muted p-3 mb-4", children: /* @__PURE__ */ jsxRuntimeExports.jsx(User, { className: "h-6 w-6 text-muted-foreground" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "text-lg font-medium", children: "Nenhum contato encontrado" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-muted-foreground max-w-sm mt-1", children: searchTerm ? "Não encontramos resultados para a sua busca." : "Os contatos aparecerão aqui automaticamente quando iniciarem uma conversa." })
      ] }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(ContactDetailsSheet, { contactId: selectedContactId, open: !!selectedContactId, onOpenChange: (open) => !open && setSelectedContactId(null) })
  ] });
}
export {
  ContactsPage as component
};
