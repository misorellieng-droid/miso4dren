// Identificação do build em execução (hash do commit + hora), injetada pelo
// vite.config. Rótulo discreto no canto inferior esquerdo, só para saber qual
// versão está rodando.
declare const __BUILD_ID__: string;
declare const __BUILD_TIME__: string;

if (typeof document !== "undefined" && typeof __BUILD_ID__ !== "undefined") {
  const montar = () => {
    if (document.getElementById("miso4-build-badge")) return;
    const el = document.createElement("div");
    el.id = "miso4-build-badge";
    let quando = "";
    try { quando = new Date(__BUILD_TIME__).toLocaleString("pt-BR"); } catch { /* ignora */ }
    el.textContent = "build " + __BUILD_ID__;
    el.title = "Build " + __BUILD_ID__ + (quando ? " · " + quando : "");
    el.style.cssText =
      "position:fixed;left:6px;bottom:2px;z-index:2147483000;font:10px/1 ui-monospace,monospace;" +
      "color:#888;opacity:.55;pointer-events:none;user-select:none;";
    document.body.appendChild(el);
  };
  if (document.body) montar();
  else document.addEventListener("DOMContentLoaded", montar);
}

export {};
