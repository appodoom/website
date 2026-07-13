export async function page3script() {
  const container = document.getElementById("analyticsContainer");

  container.innerHTML = "<p>Loading analytics...</p>";

  try {
    const response = await fetch("/web/analytics");

    if (!response.ok) {
      throw new Error("Failed to load analytics");
    }

    const analytics = await response.json();

    container.innerHTML = "";

    const categories = Object.keys(analytics).sort();

    if (categories.length === 0) {
      container.innerHTML = "<p>No analytics available.</p>";
      return;
    }

    for (const category of categories) {
      const details = document.createElement("details");
      details.className = "analytics-category";

      const summary = document.createElement("summary");
      summary.textContent = category;
      details.appendChild(summary);

      const table = document.createElement("table");
      table.className = "analytics-table";

      table.innerHTML = `
        <thead>
          <tr>
            <th>Counter</th>
            <th>Value</th>
          </tr>
        </thead>
      `;

      const tbody = document.createElement("tbody");

      const counters = analytics[category];

      Object.entries(counters)
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([name, value]) => {
          const tr = document.createElement("tr");

          tr.innerHTML = `
            <td>${name}</td>
            <td>${value}</td>
          `;

          tbody.appendChild(tr);
        });

      table.appendChild(tbody);
      details.appendChild(table);

      container.appendChild(details);
    }
  } catch (err) {
    console.error(err);

    container.innerHTML = `
      <div class="panel admin-panel">
        Failed to load analytics.
      </div>
    `;
  }
}
