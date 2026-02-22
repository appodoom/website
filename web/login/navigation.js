var pageId = [0]; // pass by reference
document.getElementById("dummy").addEventListener("click", () => {
    renderPage(pageId);
});
async function renderPage(pageId) {
    const container = document.getElementById("main_content");
    container.innerHTML = "";

    const tpl = document.getElementById(`page-${pageId[0]}`);
    container.appendChild(tpl.content.cloneNode(true));
    try {
        const module = await import(`./page${pageId[0]}script.js`);
        const fn = module[`page${pageId[0]}script`];
        if (typeof fn === "function") {
            fn(pageId);
        }
    } catch (error) {
        console.log("could not load", error);
    }
}

// init
(async () => {
    await renderPage(pageId);
})();