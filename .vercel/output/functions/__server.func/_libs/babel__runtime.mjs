var _extends = { exports: {} };
var hasRequired_extends;
function require_extends() {
  if (hasRequired_extends) return _extends.exports;
  hasRequired_extends = 1;
  (function(module) {
    function _extends2() {
      return module.exports = _extends2 = Object.assign ? Object.assign.bind() : function(n) {
        for (var e = 1; e < arguments.length; e++) {
          var t = arguments[e];
          for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]);
        }
        return n;
      }, module.exports.__esModule = true, module.exports["default"] = module.exports, _extends2.apply(null, arguments);
    }
    module.exports = _extends2, module.exports.__esModule = true, module.exports["default"] = module.exports;
  })(_extends);
  return _extends.exports;
}
var objectWithoutPropertiesLoose = { exports: {} };
var hasRequiredObjectWithoutPropertiesLoose;
function requireObjectWithoutPropertiesLoose() {
  if (hasRequiredObjectWithoutPropertiesLoose) return objectWithoutPropertiesLoose.exports;
  hasRequiredObjectWithoutPropertiesLoose = 1;
  (function(module) {
    function _objectWithoutPropertiesLoose(r, e) {
      if (null == r) return {};
      var t = {};
      for (var n in r) if ({}.hasOwnProperty.call(r, n)) {
        if (-1 !== e.indexOf(n)) continue;
        t[n] = r[n];
      }
      return t;
    }
    module.exports = _objectWithoutPropertiesLoose, module.exports.__esModule = true, module.exports["default"] = module.exports;
  })(objectWithoutPropertiesLoose);
  return objectWithoutPropertiesLoose.exports;
}
export {
  requireObjectWithoutPropertiesLoose as a,
  require_extends as r
};
