import { r as require_extends, a as requireObjectWithoutPropertiesLoose } from "./babel__runtime.mjs";
import { a as requireReact } from "./react.mjs";
import { r as requireUseLatest_cjs } from "./use-latest.mjs";
import { r as requireUseComposedRef_cjs } from "./use-composed-ref.mjs";
var reactTextareaAutosize_cjs = {};
var hasRequiredReactTextareaAutosize_cjs;
function requireReactTextareaAutosize_cjs() {
  if (hasRequiredReactTextareaAutosize_cjs) return reactTextareaAutosize_cjs;
  hasRequiredReactTextareaAutosize_cjs = 1;
  (function(exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    var _extends = require_extends();
    var _objectWithoutPropertiesLoose = requireObjectWithoutPropertiesLoose();
    var React = requireReact();
    var useLatest = requireUseLatest_cjs();
    var useComposedRef = requireUseComposedRef_cjs();
    function _interopDefault(e) {
      return e && e.__esModule ? e : { "default": e };
    }
    function _interopNamespace(e) {
      if (e && e.__esModule) return e;
      var n = /* @__PURE__ */ Object.create(null);
      if (e) {
        Object.keys(e).forEach(function(k) {
          if (k !== "default") {
            var d = Object.getOwnPropertyDescriptor(e, k);
            Object.defineProperty(n, k, d.get ? d : {
              enumerable: true,
              get: function() {
                return e[k];
              }
            });
          }
        });
      }
      n["default"] = e;
      return Object.freeze(n);
    }
    var React__namespace = /* @__PURE__ */ _interopNamespace(React);
    var useLatest__default = /* @__PURE__ */ _interopDefault(useLatest);
    var useComposedRef__default = /* @__PURE__ */ _interopDefault(useComposedRef);
    var isBrowser = typeof document !== "undefined";
    var HIDDEN_TEXTAREA_STYLE = {
      "min-height": "0",
      "max-height": "none",
      height: "0",
      visibility: "hidden",
      overflow: "hidden",
      position: "absolute",
      "z-index": "-1000",
      top: "0",
      right: "0",
      display: "block"
    };
    var forceHiddenStyles = function forceHiddenStyles2(node) {
      Object.keys(HIDDEN_TEXTAREA_STYLE).forEach(function(key) {
        node.style.setProperty(key, HIDDEN_TEXTAREA_STYLE[key], "important");
      });
    };
    var forceHiddenStyles$1 = forceHiddenStyles;
    var hiddenTextarea = null;
    var getHeight = function getHeight2(node, sizingData) {
      var height = node.scrollHeight;
      if (sizingData.sizingStyle.boxSizing === "border-box") {
        return height + sizingData.borderSize;
      }
      return height - sizingData.paddingSize;
    };
    function calculateNodeHeight(sizingData, value, minRows, maxRows) {
      if (minRows === void 0) {
        minRows = 1;
      }
      if (maxRows === void 0) {
        maxRows = Infinity;
      }
      if (!hiddenTextarea) {
        hiddenTextarea = document.createElement("textarea");
        hiddenTextarea.setAttribute("tabindex", "-1");
        hiddenTextarea.setAttribute("aria-hidden", "true");
        forceHiddenStyles$1(hiddenTextarea);
      }
      if (hiddenTextarea.parentNode === null) {
        document.body.appendChild(hiddenTextarea);
      }
      var paddingSize = sizingData.paddingSize, borderSize = sizingData.borderSize, sizingStyle = sizingData.sizingStyle;
      var boxSizing = sizingStyle.boxSizing;
      Object.keys(sizingStyle).forEach(function(_key) {
        var key = _key;
        hiddenTextarea.style[key] = sizingStyle[key];
      });
      forceHiddenStyles$1(hiddenTextarea);
      hiddenTextarea.value = value;
      var height = getHeight(hiddenTextarea, sizingData);
      hiddenTextarea.value = value;
      height = getHeight(hiddenTextarea, sizingData);
      hiddenTextarea.value = "x";
      var rowHeight = hiddenTextarea.scrollHeight - paddingSize;
      var minHeight = rowHeight * minRows;
      if (boxSizing === "border-box") {
        minHeight = minHeight + paddingSize + borderSize;
      }
      height = Math.max(minHeight, height);
      var maxHeight = rowHeight * maxRows;
      if (boxSizing === "border-box") {
        maxHeight = maxHeight + paddingSize + borderSize;
      }
      height = Math.min(maxHeight, height);
      return [height, rowHeight];
    }
    var noop = function noop2() {
    };
    var pick = function pick2(props, obj) {
      return props.reduce(function(acc, prop) {
        acc[prop] = obj[prop];
        return acc;
      }, {});
    };
    var SIZING_STYLE = [
      "borderBottomWidth",
      "borderLeftWidth",
      "borderRightWidth",
      "borderTopWidth",
      "boxSizing",
      "fontFamily",
      "fontSize",
      "fontStyle",
      "fontWeight",
      "letterSpacing",
      "lineHeight",
      "paddingBottom",
      "paddingLeft",
      "paddingRight",
      "paddingTop",
      // non-standard
      "tabSize",
      "textIndent",
      // non-standard
      "textRendering",
      "textTransform",
      "width",
      "wordBreak",
      "wordSpacing",
      "scrollbarGutter"
    ];
    var isIE = isBrowser ? !!document.documentElement.currentStyle : false;
    var getSizingData = function getSizingData2(node) {
      var style = window.getComputedStyle(node);
      if (style === null) {
        return null;
      }
      var sizingStyle = pick(SIZING_STYLE, style);
      var boxSizing = sizingStyle.boxSizing;
      if (boxSizing === "") {
        return null;
      }
      if (isIE && boxSizing === "border-box") {
        sizingStyle.width = parseFloat(sizingStyle.width) + parseFloat(sizingStyle.borderRightWidth) + parseFloat(sizingStyle.borderLeftWidth) + parseFloat(sizingStyle.paddingRight) + parseFloat(sizingStyle.paddingLeft) + "px";
      }
      var paddingSize = parseFloat(sizingStyle.paddingBottom) + parseFloat(sizingStyle.paddingTop);
      var borderSize = parseFloat(sizingStyle.borderBottomWidth) + parseFloat(sizingStyle.borderTopWidth);
      return {
        sizingStyle,
        paddingSize,
        borderSize
      };
    };
    var getSizingData$1 = getSizingData;
    function useListener(target, type, listener) {
      var latestListener = useLatest__default["default"](listener);
      React__namespace.useLayoutEffect(function() {
        var handler = function handler2(ev) {
          return latestListener.current(ev);
        };
        if (!target) {
          return;
        }
        target.addEventListener(type, handler);
        return function() {
          return target.removeEventListener(type, handler);
        };
      }, []);
    }
    var useFormResetListener = function useFormResetListener2(libRef, listener) {
      useListener(document.body, "reset", function(ev) {
        if (libRef.current.form === ev.target) {
          listener(ev);
        }
      });
    };
    var useWindowResizeListener = function useWindowResizeListener2(listener) {
      useListener(window, "resize", listener);
    };
    var useFontsLoadedListener = function useFontsLoadedListener2(listener) {
      useListener(document.fonts, "loadingdone", listener);
    };
    var _excluded = ["cacheMeasurements", "maxRows", "minRows", "onChange", "onHeightChange"];
    var TextareaAutosize = function TextareaAutosize2(_ref, userRef) {
      var cacheMeasurements = _ref.cacheMeasurements, maxRows = _ref.maxRows, minRows = _ref.minRows, _ref$onChange = _ref.onChange, onChange = _ref$onChange === void 0 ? noop : _ref$onChange, _ref$onHeightChange = _ref.onHeightChange, onHeightChange = _ref$onHeightChange === void 0 ? noop : _ref$onHeightChange, props = _objectWithoutPropertiesLoose(_ref, _excluded);
      var isControlled = props.value !== void 0;
      var libRef = React__namespace.useRef(null);
      var ref = useComposedRef__default["default"](libRef, userRef);
      var heightRef = React__namespace.useRef(0);
      var measurementsCacheRef = React__namespace.useRef();
      var resizeTextarea = function resizeTextarea2() {
        var node = libRef.current;
        var nodeSizingData = cacheMeasurements && measurementsCacheRef.current ? measurementsCacheRef.current : getSizingData$1(node);
        if (!nodeSizingData) {
          return;
        }
        measurementsCacheRef.current = nodeSizingData;
        var _calculateNodeHeight = calculateNodeHeight(nodeSizingData, node.value || node.placeholder || "x", minRows, maxRows), height = _calculateNodeHeight[0], rowHeight = _calculateNodeHeight[1];
        if (heightRef.current !== height) {
          heightRef.current = height;
          node.style.setProperty("height", height + "px", "important");
          onHeightChange(height, {
            rowHeight
          });
        }
      };
      var handleChange = function handleChange2(event) {
        if (!isControlled) {
          resizeTextarea();
        }
        onChange(event);
      };
      if (isBrowser) {
        React__namespace.useLayoutEffect(resizeTextarea);
        useFormResetListener(libRef, function() {
          if (!isControlled) {
            var currentValue = libRef.current.value;
            requestAnimationFrame(function() {
              var node = libRef.current;
              if (node && currentValue !== node.value) {
                resizeTextarea();
              }
            });
          }
        });
        useWindowResizeListener(resizeTextarea);
        useFontsLoadedListener(resizeTextarea);
        return /* @__PURE__ */ React__namespace.createElement("textarea", _extends({}, props, {
          onChange: handleChange,
          ref
        }));
      }
      return /* @__PURE__ */ React__namespace.createElement("textarea", _extends({}, props, {
        onChange,
        ref
      }));
    };
    var index = /* @__PURE__ */ React__namespace.forwardRef(TextareaAutosize);
    exports["default"] = index;
  })(reactTextareaAutosize_cjs);
  return reactTextareaAutosize_cjs;
}
var reactTextareaAutosize_cjs_default = {};
var hasRequiredReactTextareaAutosize_cjs_default;
function requireReactTextareaAutosize_cjs_default() {
  if (hasRequiredReactTextareaAutosize_cjs_default) return reactTextareaAutosize_cjs_default;
  hasRequiredReactTextareaAutosize_cjs_default = 1;
  reactTextareaAutosize_cjs_default._default = requireReactTextareaAutosize_cjs().default;
  return reactTextareaAutosize_cjs_default;
}
var reactTextareaAutosize_cjs_defaultExports = /* @__PURE__ */ requireReactTextareaAutosize_cjs_default();
export {
  reactTextareaAutosize_cjs_defaultExports as r
};
