let dati = null;
let sortState = {
    spese: { column: null, direction: "asc" },
    trasferimenti: { column: null, direction: "asc" }
};

function isMobileCardMode() {
    const isNarrow = window.innerWidth < 768;
    const isPortrait = window.matchMedia
        ? window.matchMedia("(orientation: portrait)").matches
        : window.innerHeight > window.innerWidth;

    return isNarrow && isPortrait;
}

let lastCardMode = null;

async function caricaDati() {
    const file = document.body.dataset.json;
    const response = await fetch(file);
    dati = await response.json();
    inizializzaApp();
}

function inizializzaApp() {
    calcolaRiepilogo();
    mostraSintesiSpese();
    popolaFiltriCategorie();
    mostraSpese();
    mostraTrasferimenti();

    document.getElementById("filtroCategoria").addEventListener("change", mostraSpese);
    document.getElementById("filtroRicerca").addEventListener("input", mostraSpese);
    document.getElementById("filtroDaPagare").addEventListener("change", mostraSpese);

    document.querySelectorAll("#tabellaSpese th.sortable").forEach(th => {
        th.addEventListener("click", () => ordinaTabella("spese", th));
    });

    document.querySelectorAll("#tabellaTrasferimenti th.sortable").forEach(th => {
        th.addEventListener("click", () => ordinaTabella("trasferimenti", th));
    });

    lastCardMode = isMobileCardMode();

    window.addEventListener("resize", () => {
        clearTimeout(window._resizeTimerDashboard);
        window._resizeTimerDashboard = setTimeout(() => {
            aggiornaLayoutTabelleSeNecessario();
        }, 150);
    });

    window.addEventListener("orientationchange", () => {
        setTimeout(() => {
            aggiornaLayoutTabelleSeNecessario();
        }, 200);
    });
}

function aggiornaLayoutTabelleSeNecessario() {
    const current = isMobileCardMode();
    if (current === lastCardMode) {
        return;
    }

    lastCardMode = current;
    mostraSpese();
    mostraTrasferimenti();
}

function calcolaSaldoErede(erede) {
    const quota = dati.quote_percentuali[erede] / 100;
    const totaleImporti = dati.spese.reduce((sum, spesa) => sum + spesa.importo, 0);
    const dovuto = totaleImporti * quota;
    const pagato = dati.spese.reduce((sum, spesa) => sum + (spesa.pagamenti[erede] || 0), 0);
    const trasferimentiRicevuti = dati.trasferimenti
        .filter(t => t.a === erede)
        .reduce((sum, t) => sum + t.importo, 0);
    const trasferimentiInviati = dati.trasferimenti
        .filter(t => t.da === erede)
        .reduce((sum, t) => sum + t.importo, 0);
    const saldo = dovuto - pagato + trasferimentiRicevuti - trasferimentiInviati;

    return {
        erede,
        dovuto,
        pagato,
        trasferimentiRicevuti,
        trasferimentiInviati,
        saldo
    };
}

function calcolaRiepilogo() {
    const container = document.getElementById("riepilogoEredi");
    container.innerHTML = "";

    const riepiloghi = dati.eredi.map(calcolaSaldoErede);
    const maxSaldoAssoluto = Math.max(...riepiloghi.map(item => Math.abs(item.saldo)), 1);

    riepiloghi.forEach(item => {
        const cardClass = item.saldo > 0.01 ? "debit" : (item.saldo < -0.01 ? "credit" : "neutral");
        const balanceRatio = Math.abs(item.saldo) / maxSaldoAssoluto;
        const balanceWidth = item.saldo === 0 ? 0 : Math.max(2, Math.round(balanceRatio * 100));

        const card = document.createElement("div");
        card.className = `summary-card ${cardClass}`;
        card.style.setProperty("--balance-width", `${balanceWidth}%`);
        card.innerHTML = `
            <div class="summary-card-header">
                <h3>${item.erede}</h3>
            </div>
            <div class="summary-card-body">
                <div class="summary-row summary-base-row">
                    <span class="label">Dovuto</span>
                    <span class="value">${formatCurrency(item.dovuto)}</span>
                </div>
                <div class="summary-calc-group">
                    <div class="summary-row">
                        <span class="label"><span class="summary-operator minus">-</span>Pagato</span>
                        <span class="value">${formatCurrency(item.pagato)}</span>
                    </div>
                    <div class="summary-row">
                        <span class="label"><span class="summary-operator plus">+</span>Trasf. ricevuti</span>
                        <span class="value">${formatCurrency(item.trasferimentiRicevuti)}</span>
                    </div>
                    <div class="summary-row">
                        <span class="label"><span class="summary-operator minus">-</span>Trasf. inviati</span>
                        <span class="value">${formatCurrency(item.trasferimentiInviati)}</span>
                    </div>
                </div>
                <div class="summary-row saldo-row">
                    <span class="label">Saldo</span>
                    <span class="value saldo-value">${formatCurrency(item.saldo)}</span>
                </div>
                <div class="saldo-bar-track" aria-hidden="true">
                    <div class="saldo-bar"></div>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

function calcolaSintesiSpese() {
    const gruppi = new Map();
    let totaleGenerale = 0;

    dati.spese.forEach(spesa => {
        const categoria = spesa.categoria || "-";
        const creditore = spesa.creditore || "-";
        const importo = Number(spesa.importo) || 0;
        const chiave = `${categoria}\u0000${creditore}`;

        if (!gruppi.has(chiave)) {
            gruppi.set(chiave, {
                categoria,
                creditore,
                totale: 0
            });
        }

        gruppi.get(chiave).totale += importo;
        totaleGenerale += importo;
    });

    const righe = [...gruppi.values()].sort((a, b) => {
        const categoriaCompare = a.categoria.localeCompare(b.categoria, "it", { sensitivity: "base" });
        if (categoriaCompare !== 0) {
            return categoriaCompare;
        }

        return a.creditore.localeCompare(b.creditore, "it", { sensitivity: "base" });
    });

    return {
        righe,
        totaleGenerale
    };
}

function mostraSintesiSpese() {
    const tbody = document.querySelector("#tabellaSintesiSpese tbody");
    const tfoot = document.querySelector("#tabellaSintesiSpese tfoot");
    const sintesi = calcolaSintesiSpese();

    tbody.innerHTML = sintesi.righe.map(riga => `
        <tr>
            <td>${riga.categoria}</td>
            <td>${riga.creditore}</td>
            <td class="currency">${formatCurrency(riga.totale)}</td>
        </tr>
    `).join("");

    tfoot.innerHTML = `
        <tr class="summary-total-row">
            <td colspan="2">Totale</td>
            <td class="currency">${formatCurrency(sintesi.totaleGenerale)}</td>
        </tr>
    `;
}

function popolaFiltriCategorie() {
    const select = document.getElementById("filtroCategoria");
    const categorie = [...new Set(dati.spese.map(s => s.categoria))].filter(c => c);

    categorie.forEach(cat => {
        const option = document.createElement("option");
        option.value = cat;
        option.textContent = cat;
        select.appendChild(option);
    });
}

function mostraSpese() {
    const tbody = document.querySelector("#tabellaSpese tbody");
    const thead = document.querySelector("#tabellaSpese thead");
    const cardMode = isMobileCardMode();

    if (thead) {
        thead.style.display = cardMode ? "none" : "table-header-group";
    }

    const filtroCategoria = document.getElementById("filtroCategoria").value;
    const filtroRicerca = document.getElementById("filtroRicerca").value.toLowerCase();
    const filtroDaPagare = document.getElementById("filtroDaPagare").checked;

    const speseFiltrate = dati.spese.filter(spesa => {
        const matchCategoria = !filtroCategoria || spesa.categoria === filtroCategoria;
        const matchRicerca = !filtroRicerca ||
            spesa.descrizione.toLowerCase().includes(filtroRicerca) ||
            spesa.creditore.toLowerCase().includes(filtroRicerca);
        const matchDaPagare = !filtroDaPagare || !spesa.data;

        return matchCategoria && matchRicerca && matchDaPagare;
    });

    if (!cardMode) {
        tbody.innerHTML = speseFiltrate.map(spesa => {
            const pagatoDa = Object.entries(spesa.pagamenti)
                .filter(([_, importo]) => importo > 0)
                .map(([erede, importo]) => `${erede} (${formatCurrency(importo)})`)
                .join(", ") || "Nessuno";

            return `
                <tr>
                    <td>${spesa.data || '<em style="color:#999;">-</em>'}</td>
                    <td>${spesa.categoria}</td>
                    <td>${spesa.creditore}</td>
                    <td>${spesa.descrizione}</td>
                    <td class="currency">${formatCurrency(spesa.importo)}</td>
                    <td>${pagatoDa}</td>
                </tr>
            `;
        }).join("");
        return;
    }

    tbody.innerHTML = speseFiltrate.map(spesa => {
        const pagatoDa = Object.entries(spesa.pagamenti)
            .filter(([_, importo]) => importo > 0)
            .map(([erede, importo]) => `${erede} (${formatCurrency(importo)})`)
            .join(", ") || "Nessuno";

        return `
            <tr class="spesa-card-row">
                <td colspan="6">
                    <div class="spesa-card">
                        <div class="spesa-card-header">
                            <div class="spesa-card-title">
                                <span class="spesa-card-data">${spesa.data || "-"}</span>
                                <span class="spesa-card-categoria">${spesa.categoria || ""}</span>
                            </div>
                            <div class="spesa-card-importo">${formatCurrency(spesa.importo)}</div>
                        </div>
                        <div class="spesa-card-body">
                            <div class="spesa-card-descrizione">${spesa.descrizione || ""}</div>
                            <div class="spesa-card-creditore"><strong>Creditore:</strong> ${spesa.creditore || ""}</div>
                            <div class="spesa-card-pagato"><strong>Pagato da:</strong> ${pagatoDa}</div>
                        </div>
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}

function mostraTrasferimenti() {
    const tbody = document.querySelector("#tabellaTrasferimenti tbody");
    const thead = document.querySelector("#tabellaTrasferimenti thead");
    const cardMode = isMobileCardMode();

    if (thead) {
        thead.style.display = cardMode ? "none" : "table-header-group";
    }

    if (!cardMode) {
        tbody.innerHTML = dati.trasferimenti.map(t => `
            <tr>
                <td>${t.data}</td>
                <td>${t.da}</td>
                <td>${t.a}</td>
                <td class="currency positive-amount">${formatCurrency(t.importo)}</td>
                <td>${t.note || ""}</td>
            </tr>
        `).join("");
        return;
    }

    tbody.innerHTML = dati.trasferimenti.map(t => `
        <tr class="trasf-card-row">
            <td colspan="5">
                <div class="trasf-card">
                    <div class="trasf-card-header">
                        <span class="trasf-card-data">${t.data || "-"}</span>
                        <span class="trasf-card-importo">${formatCurrency(t.importo)}</span>
                    </div>
                    <div class="trasf-card-body">
                        <div><strong>Da:</strong> ${t.da}</div>
                        <div><strong>A:</strong> ${t.a}</div>
                        ${t.note ? `<div class="trasf-card-note">${t.note}</div>` : ""}
                    </div>
                </div>
            </td>
        </tr>
    `).join("");
}

function formatCurrency(value) {
    return new Intl.NumberFormat("it-IT", {
        style: "currency",
        currency: "EUR"
    }).format(value);
}

function ordinaTabella(tipo, th) {
    const column = th.dataset.column;
    const dataType = th.dataset.type;
    const state = sortState[tipo];

    if (state.column === column) {
        state.direction = state.direction === "asc" ? "desc" : "asc";
    } else {
        state.column = column;
        state.direction = "asc";
    }

    th.parentElement.querySelectorAll("th").forEach(h => {
        h.classList.remove("sort-asc", "sort-desc");
    });

    th.classList.add(state.direction === "asc" ? "sort-asc" : "sort-desc");

    const dataArray = tipo === "spese" ? dati.spese : dati.trasferimenti;
    dataArray.sort((a, b) => {
        let valA = a[column];
        let valB = b[column];

        if (dataType === "number") {
            valA = parseFloat(valA) || 0;
            valB = parseFloat(valB) || 0;
        } else {
            valA = String(valA).toLowerCase();
            valB = String(valB).toLowerCase();
        }

        if (valA < valB) return state.direction === "asc" ? -1 : 1;
        if (valA > valB) return state.direction === "asc" ? 1 : -1;
        return 0;
    });

    if (tipo === "spese") {
        mostraSpese();
    } else {
        mostraTrasferimenti();
    }
}

async function esportaPDF(opzioni = {}) {
    const {
        titolo = "Dashboard Successione",
        nomeFile = "successione_riepilogo.pdf",
        sottotitolo = "Riepilogo pagamenti e trasferimenti"
    } = opzioni;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const colori = {
        primary: [64, 89, 128],
        headFill: [230, 236, 246],
        headText: [31, 41, 55],
        grid: [218, 224, 233],
        muted: [104, 113, 130],
        text: [31, 41, 55],
        track: [232, 237, 243],
        credit: [20, 132, 119],
        debit: [196, 55, 76]
    };
    const margini = { left: 14, right: 14 };
    const stileTabella = {
        theme: "grid",
        margin: margini,
        headStyles: {
            fillColor: colori.headFill,
            textColor: colori.headText,
            lineColor: colori.grid,
            lineWidth: 0.1,
            fontStyle: "bold"
        },
        styles: {
            textColor: colori.text,
            lineColor: colori.grid,
            lineWidth: 0.1,
            cellPadding: 2.8,
            fontSize: 8.5
        },
        alternateRowStyles: {
            fillColor: [249, 250, 252]
        }
    };
    const titoloSezione = testo => {
        doc.setFontSize(12);
        doc.setTextColor(...colori.primary);
        doc.text(testo, margini.left, yPos);
        yPos += 6;
    };

    doc.setFontSize(17);
    doc.setTextColor(...colori.primary);
    doc.text(titolo, margini.left, 18);

    doc.setFontSize(9);
    doc.setTextColor(...colori.muted);
    doc.text(sottotitolo, margini.left, 25);
    doc.text(`Generato il: ${new Date().toLocaleDateString("it-IT")}`, margini.left, 31);

    let yPos = 39;

    titoloSezione("Riepilogo per Erede");

    const riepilogoData = dati.eredi.map(erede => {
        const riepilogo = calcolaSaldoErede(erede);
        return [
            erede,
            formatCurrency(riepilogo.dovuto),
            formatCurrency(riepilogo.pagato),
            formatCurrency(riepilogo.trasferimentiRicevuti),
            formatCurrency(riepilogo.trasferimentiInviati),
            formatCurrency(riepilogo.saldo)
        ];
    });

    doc.autoTable({
        ...stileTabella,
        startY: yPos,
        head: [["Erede", "Dovuto", "Pagato", "Trasf. Ric.", "Trasf. Inv.", "Saldo"]],
        body: riepilogoData,
        columnStyles: {
            1: { halign: "right" },
            2: { halign: "right" },
            3: { halign: "right" },
            4: { halign: "right" },
            5: { halign: "right", fontStyle: "bold" }
        }
    });

    yPos = doc.lastAutoTable.finalY + 10;

    const paginaAltezza = doc.internal.pageSize.getHeight();
    const margineBasso = 18;
    const assicuratiSpazio = altezzaRichiesta => {
        if (yPos + altezzaRichiesta > paginaAltezza - margineBasso) {
            doc.addPage();
            yPos = 20;
        }
    };

    const sintesiSpese = calcolaSintesiSpese();
    assicuratiSpazio(42);
    titoloSezione("Sintesi spese");

    doc.autoTable({
        ...stileTabella,
        startY: yPos,
        head: [["Categoria", "Creditore", "Totale"]],
        body: sintesiSpese.righe.map(riga => [
            riga.categoria,
            riga.creditore,
            formatCurrency(riga.totale)
        ]),
        foot: [["Totale", "", formatCurrency(sintesiSpese.totaleGenerale)]],
        styles: { ...stileTabella.styles, fontSize: 8.4 },
        footStyles: {
            fillColor: colori.headFill,
            textColor: colori.headText,
            lineColor: colori.grid,
            lineWidth: 0.1,
            fontStyle: "bold"
        },
        columnStyles: {
            2: { halign: "right", fontStyle: "bold" }
        }
    });

    yPos = doc.lastAutoTable.finalY + 10;

    const saldiSintesi = dati.eredi.map(erede => ({
        erede,
        saldo: calcolaSaldoErede(erede).saldo
    }));
    const maxSaldoAssoluto = Math.max(...saldiSintesi.map(item => Math.abs(item.saldo)), 1);

    assicuratiSpazio(54);
    titoloSezione("Sintesi saldi");

    doc.autoTable({
        ...stileTabella,
        startY: yPos,
        head: [["Erede", "Saldo", "Indicatore"]],
        body: saldiSintesi.map(item => [item.erede, formatCurrency(item.saldo), ""]),
        styles: { ...stileTabella.styles, fontSize: 8.5, cellPadding: 2.6 },
        columnStyles: {
            1: { halign: "right" },
            2: { cellWidth: 70 }
        },
        didParseCell: data => {
            if (data.section === "body" && data.column.index === 1) {
                const saldo = saldiSintesi[data.row.index].saldo;
                if (saldo > 0.01) {
                    data.cell.styles.textColor = colori.debit;
                } else if (saldo < -0.01) {
                    data.cell.styles.textColor = colori.credit;
                }
                data.cell.styles.fontStyle = "bold";
            }
        },
        didDrawCell: data => {
            if (data.section !== "body" || data.column.index !== 2) {
                return;
            }

            const saldo = saldiSintesi[data.row.index].saldo;
            const trackX = data.cell.x + 3;
            const trackY = data.cell.y + data.cell.height / 2 - 1;
            const trackWidth = data.cell.width - 6;
            const trackHeight = 2;
            const fillWidth = saldo === 0
                ? 0
                : Math.max(2, (Math.abs(saldo) / maxSaldoAssoluto) * trackWidth);

            doc.setFillColor(...colori.track);
            doc.rect(trackX, trackY, trackWidth, trackHeight, "F");

            if (fillWidth > 0) {
                if (saldo > 0) {
                    doc.setFillColor(...colori.debit);
                } else {
                    doc.setFillColor(...colori.credit);
                }
                doc.rect(trackX, trackY, fillWidth, trackHeight, "F");
            }
        }
    });

    yPos = doc.lastAutoTable.finalY + 10;

    assicuratiSpazio(46);
    titoloSezione("Trasferimenti");

    const trasferimentiData = dati.trasferimenti.map(t => [
        t.data || "-",
        t.da,
        t.a,
        formatCurrency(t.importo),
        t.note || ""
    ]);

    doc.autoTable({
        ...stileTabella,
        startY: yPos,
        head: [["Data", "Da", "A", "Importo", "Note"]],
        body: trasferimentiData,
        styles: { ...stileTabella.styles, fontSize: 8 },
        columnStyles: {
            3: { halign: "right" }
        }
    });

    doc.addPage();
    yPos = 20;
    titoloSezione("Elenco Spese");

    const speseData = dati.spese.map(spesa => {
        const pagatoDa = Object.entries(spesa.pagamenti)
            .filter(([_, importo]) => importo > 0)
            .map(([erede, _]) => erede)
            .join(", ") || "Nessuno";
        return [
            spesa.data || "-",
            spesa.categoria,
            spesa.creditore,
            spesa.descrizione,
            formatCurrency(spesa.importo),
            pagatoDa
        ];
    });

    doc.autoTable({
        ...stileTabella,
        startY: yPos,
        head: [["Data", "Categoria", "Creditore", "Descrizione", "Importo", "Pagato da"]],
        body: speseData,
        styles: { ...stileTabella.styles, fontSize: 7.8 },
        columnStyles: {
            4: { halign: "right" }
        }
    });

    doc.save(nomeFile);
}

document.addEventListener("DOMContentLoaded", caricaDati);
