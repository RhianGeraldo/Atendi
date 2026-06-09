import { j as jsxRuntimeExports } from "../_libs/react.mjs";
import { C as Card } from "./card-DQ5v2DYb.mjs";
import { o as Construction } from "../_libs/lucide-react.mjs";
import "./utils-H80jjgLf.mjs";
import "../_libs/clsx.mjs";
import "../_libs/tailwind-merge.mjs";
function Soon({
  title
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "p-6", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Card, { className: "flex flex-col items-center gap-3 p-12 text-center", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid h-14 w-14 place-items-center rounded-full bg-muted text-muted-foreground", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Construction, { className: "h-6 w-6" }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-lg font-semibold", children: title }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "max-w-md text-sm text-muted-foreground", children: [
      "Esta tela faz parte das próximas entregas do MVP. Foque em",
      /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: " Dashboard " }),
      " e ",
      /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: "Atendimentos" }),
      " por enquanto."
    ] })
  ] }) });
}
const SplitComponent = () => /* @__PURE__ */ jsxRuntimeExports.jsx(Soon, { title: "Contatos" });
export {
  SplitComponent as component
};
