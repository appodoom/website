export function page1script() {
    const rowLabels = [
        "Percentages",
        "Doom",
        "Open Tak",
        "Open Tik",
        // "Tik1",
        // "Tik2",
        // "Ra2",
        "Pa2",
    ];

    const maxSubd = Number(localStorage.getItem("maxSubd"));
    generateMatrix(maxSubd);

    function generateMatrix(nb_cols) {
        const rows = rowLabels.length;
        const cols = nb_cols;
        const container = document.getElementById("matrix");
        container.innerHTML = "";

        container.className = "matrix";
        container.style.display = "grid";
        container.style.gridTemplateColumns = `120px repeat(${cols}, 40px)`;
        container.style.gridTemplateRows = `40px repeat(${rows}, 30px)`;

        // Empty corner
        container.appendChild(document.createElement("div"));

        // Column labels (left → right)
        for (let c = cols; c > 0; c--) {
            const div = document.createElement("div");
            div.className = "col-label";
            div.textContent = c;
            container.appendChild(div);
        }

        // Rows with labels + inputs
        for (let r = 0; r < rows; r++) {
            const label = document.createElement("div");
            label.className = "row-label";
            label.textContent = rowLabels[r];
            container.appendChild(label);

            for (let c = 0; c < cols; c++) {
                const input = document.createElement("input");
                input.type = "text";
                input.classList.add("step_2_input");
                container.appendChild(input);
            }
        }
    }

    function getMatrix() {
        const matrix_inputs_raw = document.querySelectorAll(".step_2_input");
        const maxsubd = Number(localStorage.getItem("maxSubd"));
        const matrix_inputs = [];
        let k = -1;
        for (let i = 0; i < matrix_inputs_raw.length; i++) {
            if (i % maxsubd === 0) {
                matrix_inputs.push([]);
                k++;
            }
            let valuetopush = matrix_inputs_raw[i].value.trim() === "" ? undefined : matrix_inputs_raw[i].value;
            matrix_inputs[k].push(valuetopush ? (isNaN(valuetopush) ? undefined : Number(valuetopush)) : undefined);
        }
        fillMatrix(matrix_inputs);
        return matrix_inputs;
    }

    function fillMatrix(m) {
        for (let i = 0; i < m.length; i++) {
            let lastValue = 0;
            for (let j = 0; j < m[0].length; j++) {
                if (m[i][j] !== undefined) lastValue = m[i][j];
                else m[i][j] = lastValue;
            }
        }
    }

    document.getElementById("next-btn").addEventListener("click", () => {
        const matrix = getMatrix();
        localStorage.setItem("matrix", JSON.stringify(matrix));
        localStorage.setItem("currPage", 2);
        document.getElementById("dummy").click();
    });
}