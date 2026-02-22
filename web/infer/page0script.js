export function page0script(p) {
    function showToast(message, duration = 3000) {
        let container = document.getElementById("toast-container");
        if (!container) {
            container = document.createElement("div");
            container.id = "toast-container";
            document.body.appendChild(container);
        }
        container.style.position = "fixed";
        container.style.bottom = "20px";
        container.style.left = "50%";
        container.style.transform = "translateX(-50%)";
        container.style.zIndex = "9999";

        const toast = document.createElement("div");
        toast.textContent = message;
        toast.style.background = "rgba(0,0,0,0.8)";
        toast.style.color = "#fff";
        toast.style.padding = "10px 20px";
        toast.style.marginTop = "10px";
        toast.style.borderRadius = "5px";
        toast.style.fontFamily = "sans-serif";
        toast.style.fontSize = "14px";
        toast.style.boxShadow = "0 2px 6px rgba(0,0,0,0.3)";
        toast.style.opacity = "0";
        toast.style.transition = "opacity 0.3s ease";

        container.appendChild(toast);

        // Fade in
        requestAnimationFrame(() => {
            toast.style.opacity = "1";
        });

        // Fade out after duration
        setTimeout(() => {
            toast.style.opacity = "0";
            toast.addEventListener("transitionend", () => {
                toast.remove();
            });
        }, duration);
    }

    const nextBtn = document.getElementById("submit");
    nextBtn.addEventListener("click", (e) => {
        e.preventDefault();
        const inputs = document.querySelectorAll("input[type='text']");
        let isOkay = true;
        for (const inp of inputs) {
            if (inp.value.trim().length === 0) {
                showToast("All fields are required.");
                isOkay = false;
                break;
            }

            if (isNaN(inp.value) || Number(inp.value) <= 0) {
                showToast("Only input numbers greater than 0.");
                isOkay = false;
                break;
            }

        }
        if (isOkay) {
            for (const inp of inputs) {
                localStorage.setItem(inp.name, inp.value);
            }
            p[0] = 1;
            document.getElementById("dummy").click();
        }
    });
}