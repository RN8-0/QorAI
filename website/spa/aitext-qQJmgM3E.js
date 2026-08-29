import{e as m}from"./vendor-DzEykzq0.js";var u={exports:{}},l={};/**
 * @license React
 * react-jsx-runtime.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */var d=m,x=Symbol.for("react.element"),y=Symbol.for("react.fragment"),j=Object.prototype.hasOwnProperty,h=d.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner,v={key:!0,ref:!0,__self:!0,__source:!0};function c(t,r,o){var e,s={},n=null,p=null;o!==void 0&&(n=""+o),r.key!==void 0&&(n=""+r.key),r.ref!==void 0&&(p=r.ref);for(e in r)j.call(r,e)&&!v.hasOwnProperty(e)&&(s[e]=r[e]);if(t&&t.defaultProps)for(e in r=t.defaultProps,r)s[e]===void 0&&(s[e]=r[e]);return{$$typeof:x,type:t,key:n,ref:p,props:s,_owner:h.current}}l.Fragment=y;l.jsx=c;l.jsxs=c;u.exports=l;var a=u.exports;function E({text:t}){return String(t||"").split(`
`).map((r,o)=>{let e=r.trim();if(!e)return a.jsx("div",{style:{height:8}},o);if(/^```(?:json|javascript|js|ts)?\s*$/i.test(e))return null;const s=/^#{1,6}\s+/.test(e);e=e.replace(/^#{1,6}\s+/,"").replace(/^>\s+/,"").replace(/^["']?([A-Za-zÇĞİÖŞÜçğıöşü0-9 _-]{2,32})["']?\s*:\s*$/,"$1");const n=/^[-•*]\s+/.test(e),f=(n?e.replace(/^[-•*]\s+/,""):e).split(/(\*\*[^*]+\*\*)/g).map((i,_)=>i.startsWith("**")&&i.endsWith("**")?a.jsx("strong",{children:i.slice(2,-2)},_):i);return a.jsx("p",{className:"ai-line"+(s?" ai-heading":"")+(n?" ai-bullet":""),children:f},o)})}export{E as A,a as j};
