export function page1script(p) {
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
    document.getElementById("switch_page").addEventListener("click", () => {
        p[0] = Number(!p[0]);
        document.getElementById("dummy").click();
    })

    document.getElementById("submit").addEventListener("click", async () => {
        const user = document.querySelector("input[type='text']").value;
        const pass = document.querySelector("input[type='password']").value;
        if (!user || !pass || user.trim() === "" || pass.trim() === "") {
            showToast("All inputs are required!");
            return;
        }
        try {
            const res = await fetch("/web/api/register/", {
                method: 'POST',
                headers: {
                    'Content-Type': "application/json"
                },
                body: JSON.stringify({ user, pass })
            })

            if (!res.ok) {
                const { error } = await res.json()
                throw new Error(error);
            }

            if (res.redirected) {
                window.location.href = res.url;
            }
        } catch (e) {
            showToast(e.message);
            return;
        }
    })
}