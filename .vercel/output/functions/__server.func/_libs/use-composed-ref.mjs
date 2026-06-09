import { a as requireReact } from "./react.mjs";
var useComposedRef_cjs = {};
var hasRequiredUseComposedRef_cjs;
function requireUseComposedRef_cjs() {
  if (hasRequiredUseComposedRef_cjs) return useComposedRef_cjs;
  hasRequiredUseComposedRef_cjs = 1;
  (function(exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    var React = requireReact();
    function _interopDefault(e) {
      return e && e.__esModule ? e : { "default": e };
    }
    var React__default = /* @__PURE__ */ _interopDefault(React);
    var updateRef = function updateRef2(ref, value) {
      if (typeof ref === "function") {
        ref(value);
        return;
      }
      ref.current = value;
    };
    var useComposedRef = function useComposedRef2(libRef, userRef) {
      var prevUserRef = React__default["default"].useRef();
      return React__default["default"].useCallback(function(instance) {
        libRef.current = instance;
        if (prevUserRef.current) {
          updateRef(prevUserRef.current, null);
        }
        prevUserRef.current = userRef;
        if (!userRef) {
          return;
        }
        updateRef(userRef, instance);
      }, [userRef]);
    };
    exports["default"] = useComposedRef;
  })(useComposedRef_cjs);
  return useComposedRef_cjs;
}
export {
  requireUseComposedRef_cjs as r
};
