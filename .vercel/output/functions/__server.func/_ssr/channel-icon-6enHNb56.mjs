import { j as jsxRuntimeExports } from "../_libs/react.mjs";
import { c as cn } from "./utils-H80jjgLf.mjs";
import { _ as Instagram } from "../_libs/lucide-react.mjs";
function ChannelIcon({ channel, className }) {
  if (channel === "instagram") {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(
      "span",
      {
        className: cn(
          "inline-grid h-5 w-5 place-items-center rounded text-white",
          className
        ),
        style: {
          background: "linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)"
        },
        title: "Instagram",
        children: /* @__PURE__ */ jsxRuntimeExports.jsx(Instagram, { className: "h-3 w-3" })
      }
    );
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "span",
    {
      className: cn(
        "inline-grid h-5 w-5 place-items-center rounded bg-[#25D366] text-white",
        className
      ),
      title: "WhatsApp",
      children: /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { viewBox: "0 0 24 24", fill: "currentColor", className: "h-3 w-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { d: "M20.52 3.48A11.78 11.78 0 0 0 12.04 0C5.5 0 .19 5.31.19 11.85c0 2.09.55 4.13 1.6 5.93L0 24l6.4-1.68a11.84 11.84 0 0 0 5.64 1.44h.01c6.54 0 11.85-5.31 11.85-11.85 0-3.17-1.23-6.14-3.38-8.43Zm-8.48 18.2h-.01a9.84 9.84 0 0 1-5.01-1.37l-.36-.21-3.8 1 1.02-3.7-.23-.38a9.83 9.83 0 0 1-1.51-5.18c0-5.44 4.43-9.86 9.87-9.86 2.64 0 5.12 1.03 6.98 2.89a9.78 9.78 0 0 1 2.89 6.98c0 5.44-4.43 9.85-9.84 9.85Z" }) })
    }
  );
}
export {
  ChannelIcon as C
};
