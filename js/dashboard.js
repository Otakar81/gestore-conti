let dati = null;
let pronto = false;
const generale = document.body.dataset.vista === "completa";
const esc = Conti.escapeHtml;

function inizializzaViste() {
    document.querySelectorAll('.view-tabs').forEach(tablist => {
        const tabs = [...tablist.querySelectorAll('[role="tab"]')];
        const seleziona = tab => {
            tabs.forEach(item => {
                const attivo = item === tab;
                item.setAttribute('aria-selected', String(attivo));
                item.tabIndex = attivo ? 0 : -1;
                document.getElementById(item.getAttribute('aria-controls')).hidden = !attivo;
            });
        };
        tabs.forEach((tab, index) => {
            tab.addEventListener('click', () => seleziona(tab));
            tab.addEventListener('keydown', event => {
                let target;
                if (event.key === 'ArrowRight') target = tabs[(index + 1) % tabs.length];
                if (event.key === 'ArrowLeft') target = tabs[(index + tabs.length - 1) % tabs.length];
                if (event.key === 'Home') target = tabs[0];
                if (event.key === 'End') target = tabs[tabs.length - 1];
                if (!target) return;
                event.preventDefault();
                seleziona(target);
                target.focus();
            });
        });
    });
}
let sortState = {
    spese: { column: null, direction: "asc" },
    trasferimenti: { column: null, direction: "asc" }
};

async function caricaDati() {
    const status = document.getElementById("dataStatus");
    const button = document.getElementById("btn-refresh");
    button.disabled = true;
    document.getElementById("btn-export").disabled = true;
    status.textContent = "Lettura da Google Sheets in corso…";
    status.classList.remove("error");
    try {
        dati = await Conti.carica(document.body.dataset.vista);
        if (!pronto) {
            inizializzaApp();
            pronto = true;
        } else {
            Object.values(sortState).forEach(state => { state.column = null; state.direction = "asc"; });
            document.querySelectorAll("th.sortable").forEach(th => th.classList.remove("sort-asc", "sort-desc"));
            document.querySelectorAll(".sort-controls select").forEach(select => { select.value = ""; });
            document.querySelectorAll(".sort-controls button").forEach(button => { button.disabled = true; button.textContent = "Inverti ordine"; });
            document.querySelectorAll("th.sortable").forEach(th => th.setAttribute("aria-sort", "none"));
            popolaFiltriCategorie();
            renderDati();
        }
        const stamp = dati.lettoAlle.toLocaleString("it-IT");
        status.textContent = `Ultima lettura riuscita: ${stamp}. ${dati.avvisi.join(" ")}`;
        status.classList.toggle("error", !dati.saldoDisponibile);
        document.getElementById("btn-export").disabled = !dati.saldoDisponibile;
    } catch (error) {
        status.textContent = `${error.message} ${dati ? `Dati precedenti del ${dati.lettoAlle.toLocaleString("it-IT")}, non aggiornati. Esportazione sospesa.` : "Dati e saldi non disponibili."}`;
        status.classList.add("error");
    } finally { button.disabled = false; }
}

function renderDati() {
    calcolaRiepilogo();
    mostraSintesiSpese();
    mostraSpese();
    mostraTrasferimenti();
    mostraIncassi();
}

function inizializzaApp() {
    popolaFiltriCategorie();
    renderDati();

    document.getElementById("filtroCategoria").addEventListener("change", mostraSpese);
    document.getElementById("filtroRicerca").addEventListener("input", mostraSpese);
    document.getElementById("filtroDaPagare").addEventListener("change", mostraSpese);

    for (const [id, tipo] of [["tabellaSpese", "spese"], ["tabellaTrasferimenti", "trasferimenti"]]) {
        const table = document.getElementById(id);
        if (!table) continue;
        const headings = [...table.querySelectorAll("th.sortable")];
        const controls = document.createElement("div");
        controls.className = "sort-controls";
        const label = document.createElement("label");
        label.htmlFor = `ordine-${tipo}`;
        label.textContent = "Ordina per";
        const select = document.createElement("select");
        select.id = label.htmlFor;
        select.add(new Option("Scegli una colonna", ""));
        select.options[0].disabled = true;
        headings.forEach(th => select.add(new Option(th.textContent, th.dataset.column)));
        const button = document.createElement("button");
        button.type = "button";
        button.className = "button";
        button.textContent = "Inverti ordine";
        button.disabled = true;
        const sort = th => {
            ordinaTabella(tipo, th);
            select.value = th.dataset.column;
            button.disabled = false;
            button.textContent = sortState[tipo].direction === "asc" ? "Crescente ↑ · inverti" : "Decrescente ↓ · inverti";
            headings.forEach(h => h.setAttribute("aria-sort", h === th ? (sortState[tipo].direction === "asc" ? "ascending" : "descending") : "none"));
        };
        select.addEventListener("change", () => {
            if (select.value) sort(headings.find(th => th.dataset.column === select.value));
        });
        button.addEventListener("click", () => sort(headings.find(th => th.dataset.column === select.value)));
        headings.forEach(th => {
            th.tabIndex = 0;
            th.setAttribute("aria-sort", "none");
            th.addEventListener("click", () => sort(th));
            th.addEventListener("keydown", event => {
                if (event.key === "Enter" || event.key === " ") { event.preventDefault(); sort(th); }
            });
        });
        controls.append(label, select, button);
        table.parentElement.before(controls);
    }
}

function calcolaSaldoErede(erede) {
    return Conti.saldo(dati, erede);
}

function calcolaRiepilogo() {
    const labels = ["Erede", "Dovuto", generale ? "Anticipato" : "Sostenuto", ...(generale ? ["Trasf. ricevuti", "Trasf. inviati", "Incassi ricevuti", "Incassi spettanti"] : []), generale ? "Saldo generale" : "Differenza tematica"];
    const rows = dati.eredi.map(erede => {
        const item = calcolaSaldoErede(erede);
        const values = [esc(item.erede), formatCurrency(item.dovuto), formatCurrency(item.pagato),
            ...(generale ? [item.trasferimentiRicevuti, item.trasferimentiInviati, item.incassiRicevuti, item.incassiSpettanti].map(formatCurrency) : [])];
        const state = item.saldo === null ? "Saldo sospeso" : item.saldo > 0 ? "Deve versare" : item.saldo < 0 ? "Deve ricevere" : "In pari";
        const color = item.saldo > 0 ? "debit" : item.saldo < 0 ? "credit" : "";
        values.push(generale ? `<span class="balance ${color}">${formatCurrency(item.saldo)}<small>${state}</small></span>` : formatCurrency(item.saldo));
        const operators = ["", "", "−", "+", "−", "+", "−"];
        return `<tr>${values.map((value, i) => `<td data-label="${labels[i]}"${generale && i > 0 && i < 7 ? ` data-operator="${operators[i]}"` : ""}>${value}</td>`).join("")}</tr>`;
    });
    document.getElementById("riepilogoEredi").innerHTML = `<table class="position-table"><thead><tr>${labels.map(label => `<th scope="col">${label}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>`;
    if (!generale) {
        const totale = dati.spese.reduce((sum, row) => sum + row.importo, 0);
        const anticipato = dati.spese.reduce((sum, row) => sum + Object.values(row.pagamenti).reduce((a, b) => a + b, 0), 0);
        for (const [id, value] of [["ambitoTotale", formatCurrency(totale)], ["ambitoAnticipato", formatCurrency(anticipato)], ["ambitoResiduo", formatCurrency(totale - anticipato)], ["ambitoNumero", String(dati.spese.length)]]) {
            document.getElementById(id).textContent = value;
        }
    }
}

function righeTabella(rows, labels) {
    return rows.length ? rows.map(values => `<tr>${values.map((value, i) => `<td data-label="${labels[i]}">${value}</td>`).join("")}</tr>`).join("") : `<tr class="empty-row"><td colspan="${labels.length}">Nessun movimento corrispondente.</td></tr>`;
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
    const sintesi = calcolaSintesiSpese();
    document.querySelector("#tabellaSintesiSpese tbody").innerHTML = righeTabella(sintesi.righe.map(row => [esc(row.categoria), esc(row.creditore), formatCurrency(row.totale)]), ["Categoria", "Creditore", "Totale"]);
    document.querySelector("#tabellaSintesiSpese tfoot").innerHTML = `<tr class="summary-total-row"><td colspan="2">Totale spese</td><td class="currency">${formatCurrency(sintesi.totaleGenerale)}</td></tr>`;
    mostraGraficiSpese(sintesi);
}

function raggruppaSintesi(righe, campo) {
    const gruppi = new Map();
    righe.forEach(riga => gruppi.set(riga[campo], (gruppi.get(riga[campo]) || 0) + riga.totale));
    return [...gruppi].map(([nome, totale]) => ({ nome, totale }))
        .sort((a, b) => b.totale - a.totale || a.nome.localeCompare(b.nome, 'it'));
}

function mostraGraficiSpese(sintesi) {
    const container = document.getElementById('sintesi-grafici');
    if (!sintesi.totaleGenerale) {
        container.innerHTML = '<p class="empty-message">Totale spese pari a zero: nessuna distribuzione da rappresentare.</p>';
        return;
    }
    const percentuale = valore => new Intl.NumberFormat('it-IT', {style: 'percent', maximumFractionDigits: 2}).format(valore / sintesi.totaleGenerale);
    const categorie = raggruppaSintesi(sintesi.righe, 'categoria');
    const creditori = raggruppaSintesi(sintesi.righe, 'creditore');
    let accumulato = 0;
    const colori = categorie.map((_, index) => `hsl(${(index * 137.5) % 360} 45% 40%)`);
    const segmenti = categorie.map((riga, index) => {
        const inizio = accumulato;
        accumulato += riga.totale;
        return `${colori[index]} ${inizio / sintesi.totaleGenerale * 100}% ${accumulato / sintesi.totaleGenerale * 100}%`;
    });
    container.innerHTML = `
        <p class="chart-total">Totale spese <strong>${formatCurrency(sintesi.totaleGenerale)}</strong></p>
        <section class="expense-chart" aria-labelledby="chart-categorie-title">
            <h3 id="chart-categorie-title">Per categoria</h3>
            <div class="expense-donut" aria-hidden="true" style="background:conic-gradient(${segmenti.join(',')})"></div>
            <ul class="chart-legend">${categorie.map((riga, index) => `<li><span class="chart-name"><span class="chart-swatch" aria-hidden="true" style="background:${colori[index]}"></span>${esc(riga.nome)}</span><span class="chart-value">${formatCurrency(riga.totale)} <small>${percentuale(riga.totale)}</small></span></li>`).join('')}</ul>
        </section>
        <section class="expense-chart" aria-labelledby="chart-creditori-title">
            <h3 id="chart-creditori-title">Per creditore</h3>
            <ul class="chart-bars">${creditori.map(riga => `<li><div class="chart-bar-label"><span class="chart-name">${esc(riga.nome)}</span><span class="chart-value">${formatCurrency(riga.totale)} <small>${percentuale(riga.totale)}</small></span></div><div class="chart-track" aria-hidden="true"><span style="width:${riga.totale / sintesi.totaleGenerale * 100}%"></span></div></li>`).join('')}</ul>
        </section>`;
}

function popolaFiltriCategorie() {
    const select = document.getElementById("filtroCategoria");
    const precedente = select.value;
    select.replaceChildren(new Option("Tutte le categorie", ""));
    const categorie = [...new Set(dati.spese.map(s => s.categoria))].filter(c => c);

    categorie.forEach(cat => {
        const option = document.createElement("option");
        option.value = cat;
        option.textContent = cat;
        select.appendChild(option);
    });
    if (categorie.includes(precedente)) select.value = precedente;
}

function mostraSpese() {
    const tbody = document.querySelector("#tabellaSpese tbody");
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

    tbody.innerHTML = righeTabella(speseFiltrate.map(spesa => {
        const pagatoDa = Object.entries(spesa.pagamenti).filter(([, value]) => value > 0)
            .map(([erede, value]) => `${esc(erede)} (${formatCurrency(value)})`).join(", ") || "Nessuno";
        return [esc(spesa.data || "—"), esc(spesa.categoria), esc(spesa.creditore),
            `${esc(spesa.descrizione)}<small class="row-meta">${esc(spesa.ripartizione)}${generale ? ` · ${esc(spesa.ambito)}` : ""}</small>`, formatCurrency(spesa.importo), pagatoDa];
    }), ["Data", "Categoria", "Creditore", "Descrizione", "Importo", "Pagato da"]);
}

function mostraTrasferimenti() {
    if (!generale) return;
    document.querySelector("#tabellaTrasferimenti tbody").innerHTML = righeTabella(dati.trasferimenti.map(t => [esc(t.data), esc(t.da), esc(t.a), formatCurrency(t.importo), esc(t.note || "")]), ["Data", "Da", "A", "Importo", "Note"]);
}

function mostraIncassi() {
    if (!generale) return;
    const tbody = document.querySelector("#tabellaIncassi tbody");
    tbody.replaceChildren();
    for (const riga of dati.incassi) {
        const tr = document.createElement("tr");
        const distribuzione = dati.eredi.map(erede =>
            `${erede}: ${formatCurrency(riga.pagamenti[erede])} ricevuti / ${formatCurrency(riga.quote[erede])} spettanti`).join("\n");
        const values = [riga.id, riga.data, riga.tipo, riga.descrizione, riga.periodo,
            formatCurrency(riga.importo), riga.ripartizione, distribuzione, riga.note];
        const labels = ["ID", "Data", "Tipo", "Descrizione", "Periodo", "Importo", "Ripartizione", "Distribuzione", "Note"];
        values.forEach((value, index) => {
            const td = document.createElement("td");
            td.textContent = value;
            td.dataset.label = labels[index];
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    }
    document.getElementById("incassiEmpty").hidden = dati.incassi.length > 0;
    document.getElementById("incassiTableWrap").hidden = dati.incassi.length === 0;
}

function formatCurrency(value) {
    if (value === null) return "Non disponibile";
    const numero = value / 100;
    const segno = numero < 0 ? "-" : "";
    const [interi, decimali] = Math.abs(numero).toFixed(2).split(".");
    const interiFormattati = interi.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

    return `${segno}${interiFormattati},${decimali} \u20ac`;
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
    if (!dati?.saldoDisponibile || document.getElementById("btn-export").disabled) return;
    const {
        titolo = "Dashboard Successione",
        nomeFile = "successione_riepilogo.pdf",
        sottotitolo = generale ? "Posizione generale verso il gruppo" : "Differenza tematica: dovuto meno sostenuto"
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
    doc.text(`Lettura dati: ${dati.lettoAlle.toLocaleString("it-IT")}`, margini.left, 31);

    let yPos = 39;

    titoloSezione("Riepilogo per Erede");

    const riepilogoData = dati.eredi.map(erede => {
        const riepilogo = calcolaSaldoErede(erede);
        return [
            erede,
            formatCurrency(riepilogo.dovuto),
            formatCurrency(riepilogo.pagato),
            ...(generale ? [formatCurrency(riepilogo.trasferimentiRicevuti),
                formatCurrency(riepilogo.trasferimentiInviati),
                formatCurrency(riepilogo.incassiRicevuti),
                formatCurrency(riepilogo.incassiSpettanti)] : []),
            formatCurrency(riepilogo.saldo)
        ];
    });

    doc.autoTable({
        ...stileTabella,
        startY: yPos,
        head: [generale ? ["Erede", "Dovuto", "Anticipato", "Trasf. ric.", "Trasf. inv.", "Inc. ric.", "Inc. spett.", "Saldo"]
            : ["Erede", "Dovuto", "Sostenuto", "Differenza tematica"]],
        body: riepilogoData,
        styles: { ...stileTabella.styles, fontSize: generale ? 7 : 8.5 },
        columnStyles: Object.fromEntries(Array.from({length: generale ? 7 : 3}, (_, index) =>
            [index + 1, {halign: "right", fontStyle: index === (generale ? 6 : 2) ? "bold" : "normal"}]))
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
    titoloSezione(generale ? "Sintesi saldi generali" : "Sintesi differenze tematiche");

    doc.autoTable({
        ...stileTabella,
        startY: yPos,
        head: [["Erede", generale ? "Saldo generale" : "Differenza tematica", "Indicatore"]],
        body: saldiSintesi.map(item => [item.erede, formatCurrency(item.saldo), ""]),
        styles: { ...stileTabella.styles, fontSize: 8.5, cellPadding: 2.6 },
        columnStyles: {
            1: { halign: "right" },
            2: { cellWidth: 70 }
        },
        didParseCell: data => {
            if (data.section === "body" && data.column.index === 1) {
                const saldo = saldiSintesi[data.row.index].saldo;
                if (saldo > 0) {
                    data.cell.styles.textColor = colori.debit;
                } else if (saldo < 0) {
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

    if (generale) {
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

    yPos = doc.lastAutoTable.finalY + 10;
    assicuratiSpazio(46);
    titoloSezione("Incassi e distribuzione");
    doc.autoTable({
        ...stileTabella,
        startY: yPos,
        head: [["ID / data", "Tipo / descrizione / periodo", "Importo / ripartizione", "Ricevuti / spettanti per erede", "Note"]],
        body: dati.incassi.length ? dati.incassi.map(riga => [
            `${riga.id}\n${riga.data}`, `${riga.tipo}\n${riga.descrizione}\n${riga.periodo}`,
            `${formatCurrency(riga.importo)}\n${riga.ripartizione}`,
            dati.eredi.map(erede => `${erede}: ${formatCurrency(riga.pagamenti[erede])} / ${formatCurrency(riga.quote[erede])}`).join("\n"),
            riga.note
        ]) : [["Nessun incasso registrato", "", "", "", ""]],
        styles: { ...stileTabella.styles, fontSize: 7.5 }
    });
    }

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
            `${spesa.descrizione}\nRipartizione: ${spesa.ripartizione}${generale ? `\nAmbito: ${spesa.ambito}` : ""}`,
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

document.getElementById("btn-refresh").addEventListener("click", caricaDati);
document.addEventListener("DOMContentLoaded", () => {
    inizializzaViste();
    caricaDati();
});
