/* Applies the saved appearance before the first paint so there is no flash. */
(function () { try { var t = JSON.parse(localStorage.getItem("pt.theme") || '"system"'); if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t); } catch (e) {} })();
