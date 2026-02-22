export async function page0script(p) {
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

    const container = document.querySelector(".users"); // Adjust selector as needed
    const dict = {};

    try {
        const res = await fetch("/web/api/users/");

        if (res.redirected) {
            window.location.href = res.url;
            return;
        }

        if (!res.ok) {
            const { error } = await res.json();
            showToast(error);
            return;
        }

        const data = await res.json();
        const { users } = data;

        if (!users || users.length === 1) {
            container.textContent = "No users to show.";
            return;
        }

        container.innerHTML = '';
        const fragment = document.createDocumentFragment();

        for (const { id, username, role } of users) {
            if (role === "admin") continue;
            dict[id] = role;
            const userElement = document.createElement("div");
            userElement.className = "user";
            userElement.dataset.userId = id;

            const userInfo = document.createElement("span");
            userInfo.className = "username";
            userInfo.textContent = `${username}, ${role}`;

            const roleSelect = document.createElement("select");
            roleSelect.name = "actions";
            roleSelect.dataset.userId = id;

            const options = [
                { value: "none", text: "Decline access" },
                { value: "generate", text: "Generator" },
                { value: "rate", text: "Rator" },
            ];

            options.forEach(optionData => {
                const option = document.createElement("option");
                option.value = optionData.value;
                option.textContent = optionData.text;

                if (optionData.value === role) {
                    option.selected = true;
                }

                roleSelect.appendChild(option);
            });

            roleSelect.addEventListener("change", function() {
                dict[id] = this.value;
            });

            userElement.appendChild(userInfo);
            userElement.appendChild(roleSelect);
            fragment.appendChild(userElement);
        }

        container.appendChild(fragment);

    } catch (error) {
        showToast(error);
        return;
    }

    const submit = document.querySelector(".main_content_submit");
    submit.addEventListener("click", async (e) => {
        const res = await fetch("/web/api/roles/", {
            method: 'POST',
            body: JSON.stringify(dict),
            headers: {
                'Content-Type': "application/json"
            }
        })
        if (!res.ok) {
            const { error } = await res.json();
            showToast(error);
            return;
        }
        if (res.redirected) {
            window.location.href = res.url;
            return;
        }

        // show toast ok
        showToast("Changes applied successfully!")

    })
}