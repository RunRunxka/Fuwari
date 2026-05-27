const fs = require("fs");
let c = fs.readFileSync("src/scripts/layout-main-runtime.ts", "utf8");

// Replace the entire pageshow handler section (lines 407-440)
const pageshowStart = c.indexOf("// 修复手机端返回手势");
const pageshowEnd = c.indexOf("\t});\n\t</script>", pageshowStart);
if (pageshowEnd === -1) { console.log("END NOT FOUND"); process.exit(1); }

const cleanPageshowHandler = `// 修复手机端返回手势（bfcache 恢复）后 SVG 图标消失 & TOC 残留
\twindow.addEventListener("pageshow", (event) => {
\t\tif (event.persisted) {
\t\t\t// 回到首页时清空文章遗留的 TOC 目录
\t\t\tif (window.location.pathname === "/" || window.location.pathname === "") {
\t\t\t\tconst toc = document.getElementById("toc");
\t\t\t\tif (toc) {
\t\t\t\t\tconst el = toc.querySelector("table-of-contents");
\t\t\t\t\tif (el) el.remove();
\t\t\t\t}
\t\t\t}
\t\t\t// 双层 rAF 确保 astro-icon 的 SVG <use> 已渲染完成
\t\t\trequestAnimationFrame(() => {
\t\t\t\trequestAnimationFrame(() => {
\t\t\t\t\tdocument.querySelectorAll("svg use").forEach((use) => {
\t\t\t\t\t\tconst href = use.getAttribute("href");
\t\t\t\t\t\tif (href) {
\t\t\t\t\t\t\tuse.removeAttribute("href");
\t\t\t\t\t\t\tuse.setAttribute("href", href);
\t\t\t\t\t\t}
\t\t\t\t\t});
\t\t\t\t\twindow.dispatchEvent(new CustomEvent("content:replace"));
\t\t\t\t});
\t\t\t});
\t\t}
\t});`;

c = c.substring(0, pageshowStart) + cleanPageshowHandler + "\n</script>\n";
fs.writeFileSync("src/scripts/layout-main-runtime.ts", c);
console.log("DONE");
