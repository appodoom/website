export async function page0script(pageId) {
  setPageTitle("Audio Library", "Library");

  const container = document.getElementById("fileContainer");

  try {
    const response = await fetch("/api/generate/files/");

    if (!response.ok) {
      throw new Error("Could not load files");
    }

    const data = await response.json();

    const groups = {};

    for (const key of data.files) {
      const parts = key.split("/");

      const tag = parts[0];

      if (!groups[tag]) {
        groups[tag] = [];
      }

      groups[tag].push(key);
    }

    container.innerHTML = "";

    Object.keys(groups).forEach((tag) => {
      const item = document.createElement("div");

      item.className = "file-item";

      item.innerHTML = `
      <span class="file-icon">📁</span>
      ${tag}
      `;

      item.onclick = () => {
        container.innerHTML = "";

        const back = document.createElement("button");

        back.className = "btn";

        back.textContent = "← Back";

        back.onclick = () => {
          page0script(pageId);
        };

        container.appendChild(back);

        groups[tag].forEach((file) => {
          const fileItem = document.createElement("div");

          fileItem.className = "file-item";

          const name = file.split("/").pop();
          if (name.trim().length > 0) {
            fileItem.innerHTML = `
            <span class="file-icon">🎵</span>
            ${name}
            `;

            fileItem.onclick = () => {
              pageId.selectedFile = file;

              pageId[0] = 1;

              renderPage(pageId);
            };

            container.appendChild(fileItem);
          }
        });
      };

      container.appendChild(item);
    });
  } catch (error) {
    console.error(error);

    showToast(error.message);
  }
}
