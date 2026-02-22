document.getElementById("dummy").addEventListener("click", () => {
    const pageId = localStorage.getItem("currPage");
    renderPage(pageId);
});
async function renderPage(pageId) {
    const container = document.getElementById("main_content");
    container.innerHTML = "";

    const tpl = document.getElementById(`page-${pageId}`);
    container.appendChild(tpl.content.cloneNode(true));
    try {
        const module = await import(`./page${pageId}script.js`);
        const fn = module[`page${pageId}script`];
        if (typeof fn === "function") {
            fn();
        }
    } catch (error) {
        console.log("could not load", error);
    }
}

document.getElementById("go_back").addEventListener("click", () => {
    localStorage.setItem("currPage", 0);
    renderPage(0);
});

// init
(async () => {
    let currPage = Number(localStorage.getItem("currPage")) || 0;
    await renderPage(currPage);
})();