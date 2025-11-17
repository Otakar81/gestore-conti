/* ============================================================
   Successione Dashboard – Script comune
   ------------------------------------------------------------
   Contiene tutta la logica JS condivisa tra le varie pagine:
   - calcoli per riepilogo, spese, trasferimenti
   - esportazione PDF
   - funzioni di ordinamento e filtri
   ============================================================ */
   
let dati = null;
let sortState = {
	spese: { column: null, direction: 'asc' },
	trasferimenti: { column: null, direction: 'asc' }
};

// 🔍 Rileva se siamo in modalità "card" (mobile verticale)
function isMobileCardMode() {
    const isNarrow = window.innerWidth < 768;
    const isPortrait = window.matchMedia
        ? window.matchMedia('(orientation: portrait)').matches
        : window.innerHeight > window.innerWidth;

    return isNarrow && isPortrait;  // solo mobile + portrait
}

let lastCardMode = null;

// ============================================================
// 📦 Inizializzazione generale
// ============================================================

function inizializzaApp() {
    calcolaRiepilogo();
    calcolaChiDeveAChi();
    popolaFiltriCategorie();
    mostraSpese();
    mostraTrasferimenti();

    // Event listeners per filtri
    document.getElementById('filtroCategoria').addEventListener('change', mostraSpese);
    document.getElementById('filtroRicerca').addEventListener('input', mostraSpese);
    document.getElementById('filtroDaPagare').addEventListener('change', mostraSpese);

    // Event listeners per ordinamento
    document.querySelectorAll('#tabellaSpese th.sortable').forEach(th => {
        th.addEventListener('click', () => ordinaTabella('spese', th));
    });

    document.querySelectorAll('#tabellaTrasferimenti th.sortable').forEach(th => {
        th.addEventListener('click', () => ordinaTabella('trasferimenti', th));
    });

    // 🧩 Stato iniziale layout + listener responsive
    lastCardMode = isMobileCardMode();

    window.addEventListener('resize', () => {
        clearTimeout(window._resizeTimerDashboard);
        window._resizeTimerDashboard = setTimeout(() => {
            aggiornaLayoutTabelleSeNecessario();
        }, 150);
    });

    window.addEventListener('orientationchange', () => {
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



// ============================================================
// 💰 Riepilogo per erede
// ============================================================

function calcolaRiepilogo() {
	const container = document.getElementById('riepilogoEredi');
	container.innerHTML = '';
	
	dati.eredi.forEach(erede => {
		const quota = dati.quote_percentuali[erede] / 100;
		
		// Calcola totale importi
		const totaleImporti = dati.spese.reduce((sum, spesa) => sum + spesa.importo, 0);
		const dovuto = totaleImporti * quota;
		
		// Calcola pagato
		const pagato = dati.spese.reduce((sum, spesa) => sum + (spesa.pagamenti[erede] || 0), 0);
		
		// Calcola trasferimenti
		const trasferimentiRicevuti = dati.trasferimenti
			.filter(t => t.a === erede)
			.reduce((sum, t) => sum + t.importo, 0);
			
		const trasferimentiInviati = dati.trasferimenti
			.filter(t => t.da === erede)
			.reduce((sum, t) => sum + t.importo, 0);
		
		const differenza = dovuto - pagato + trasferimentiRicevuti - trasferimentiInviati;
		
		const cardClass = differenza > 0 ? 'positive' : (differenza < 0 ? 'negative' : '');
		
		const card = document.createElement('div');
		card.className = `summary-card ${cardClass}`;
		card.innerHTML = `
			<h3>${erede}</h3>
			<div class="summary-row">
				<span class="label">Dovuto:</span>
				<span class="value">${formatCurrency(dovuto)}</span>
			</div>
			<div class="summary-row">
				<span class="label">Pagato:</span>
				<span class="value">${formatCurrency(pagato)}</span>
			</div>
			<div class="summary-row">
				<span class="label">Trasf. ricevuti:</span>
				<span class="value">${formatCurrency(trasferimentiRicevuti)}</span>
			</div>
			<div class="summary-row">
				<span class="label">Trasf. inviati:</span>
				<span class="value">${formatCurrency(trasferimentiInviati)}</span>
			</div>
			<div class="summary-row" style="margin-top: 15px; padding-top: 15px; border-top: 2px solid #ddd;">
				<span class="label"><strong>Saldo:</strong></span>
				<span class="value" style="font-size: 1.3em;">${formatCurrency(differenza)}</span>
			</div>
		`;
		container.appendChild(card);
	});
}


// ============================================================
// 🎯 Chi deve a chi (grafico + suggeritore)
// ============================================================

function calcolaChiDeveAChi() {
	const container = document.getElementById('chiDeveAChi');

	// Calcola saldi finali
	const saldi = {};
	dati.eredi.forEach(erede => {
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

		// ✅ Formula corretta: saldo positivo = debitore
		saldi[erede] = dovuto - pagato + trasferimentiRicevuti - trasferimentiInviati;
	});

	// Dividi tra debitori e creditori (in base al segno)
	const debitori = Object.entries(saldi)
		.filter(([_, saldo]) => saldo > 0.01)
		.map(([nome, saldo]) => ({ nome, saldo }));
		
	const creditori = Object.entries(saldi)
		.filter(([_, saldo]) => saldo < -0.01)
		.map(([nome, saldo]) => ({ nome, saldo: -saldo }));
	
	// 🔹 Ordina i creditori: chi ha pagato di più (saldo più negativo) per primo
	creditori.sort((a, b) => b.saldo - a.saldo);


	if (!debitori.length && !creditori.length) {
		container.innerHTML = '<p style="color:#11998e;font-size:1.2em;text-align:center;">✅ Tutti i conti sono in pareggio!</p>';
		return;
	}

	// Struttura base blocco
	/*
	container.innerHTML = `
		<div style="margin-bottom:30px;">
			<canvas id="graficoSaldi" style="max-height:300px;"></canvas>
		</div>
		<div style="background:#f8f9fa;padding:20px;border-radius:10px;">
			<label><strong>Seleziona debitore:</strong></label>
			<select id="debitoreSelect" style="margin-left:10px;padding:8px;">
				${debitori.map(d => `<option value="${d.nome}">${d.nome} (${formatCurrency(d.saldo)})</option>`).join('')}
			</select>
			<label style="margin-left:20px;"><strong>Importo disponibile:</strong></label>
			<input type="number" id="importoDisponibile" min="0" step="0.01" style="width:120px;margin-left:10px;padding:8px;">
			<button id="btnSuggerisci" style="margin-left:15px;padding:8px 12px;border:none;background:#667eea;color:white;border-radius:6px;cursor:pointer;">
				Suggerisci
			</button>
			<div id="suggerimenti" style="margin-top:20px;"></div>
		</div>
	`;
	*/
	container.innerHTML = `
		<div style="margin-bottom:30px;">
			<canvas id="graficoSaldi" style="max-height:300px;"></canvas>
		</div>		
	`;
	// Ho eliminato il suggeritore, per adesso
	

	// Grafico a barre saldi
	const ctx = document.getElementById('graficoSaldi').getContext('2d');
	new Chart(ctx, {
		type: 'bar',
		data: {
			labels: Object.keys(saldi),
			datasets: [{
				label: 'Saldo finale',
				data: Object.values(saldi),
				borderWidth: 1,
				backgroundColor: Object.values(saldi).map(v =>
					v <= 0 ? 'rgba(17, 153, 142, 0.7)' : 'rgba(235, 51, 73, 0.7)' // verde = creditore, rosso = debitore
				),
			}]
		},
		options: {
			plugins: { legend: { display: false } },
			scales: {
				y: {
					beginAtZero: true,
					ticks: { callback: val => formatCurrency(val) }
				}
			}
		}
	});

	// Suggeritore pagamenti	
	/*
	document.getElementById('btnSuggerisci').addEventListener('click', () => {
		const debitoreNome = document.getElementById('debitoreSelect').value;
		let importoDisponibile = parseFloat(document.getElementById('importoDisponibile').value || 0);
		const suggerimentiDiv = document.getElementById('suggerimenti');

		if (importoDisponibile <= 0) {
			suggerimentiDiv.innerHTML = '<p style="color:#eb3349;">⚠️ Inserisci un importo valido.</p>';
			return;
		}

		const debitore = debitori.find(d => d.nome === debitoreNome);
		const creditoriCopy = creditori.map(c => ({ ...c }));
		const suggerimenti = [];

		for (const creditore of creditoriCopy) {
			if (importoDisponibile <= 0) break;
			const daPagare = Math.min(importoDisponibile, creditore.saldo);
			suggerimenti.push({
				da: debitore.nome,
				a: creditore.nome,
				importo: daPagare
			});
			importoDisponibile -= daPagare;
			creditore.saldo -= daPagare;
		}

		if (suggerimenti.length === 0) {
			suggerimentiDiv.innerHTML = '<p style="color:#999;">Nessun suggerimento disponibile.</p>';
			return;
		}

		suggerimentiDiv.innerHTML = `
			<h3 style="color:#667eea;margin-bottom:10px;">💡 Suggerimento pagamenti:</h3>
			${suggerimenti.map(s => `
				<p><strong>${s.da}</strong> → <strong>${s.a}</strong> :
				<span style="color:#eb3349;">${formatCurrency(s.importo)}</span></p>
			`).join('')}
		`;
	});
	*/
}


// ============================================================
// 📊 Filtri e Tabelle
// ============================================================

function popolaFiltriCategorie() {
	const select = document.getElementById('filtroCategoria');
	const categorie = [...new Set(dati.spese.map(s => s.categoria))].filter(c => c);
	
	categorie.forEach(cat => {
		const option = document.createElement('option');
		option.value = cat;
		option.textContent = cat;
		select.appendChild(option);
	});
}

function mostraSpese() {
    const tbody = document.querySelector('#tabellaSpese tbody');
    const thead = document.querySelector('#tabellaSpese thead');
    const cardMode = isMobileCardMode();

    if (thead) {
        thead.style.display = cardMode ? 'none' : 'table-header-group';
    }

    const filtroCategoria = document.getElementById('filtroCategoria').value;
    const filtroRicerca = document.getElementById('filtroRicerca').value.toLowerCase();
    const filtroDaPagare = document.getElementById('filtroDaPagare').checked;

    const speseFiltrate = dati.spese.filter(spesa => {
        const matchCategoria = !filtroCategoria || spesa.categoria === filtroCategoria;
        const matchRicerca = !filtroRicerca ||
            spesa.descrizione.toLowerCase().includes(filtroRicerca) ||
            spesa.creditore.toLowerCase().includes(filtroRicerca);

        // ✅ Filtro "Da pagare": mostra solo spese senza data
        const matchDaPagare = !filtroDaPagare || !spesa.data;

        return matchCategoria && matchRicerca && matchDaPagare;
    });

    // 🖥️ Desktop / landscape: tabella classica
    if (!cardMode) {
        tbody.innerHTML = speseFiltrate.map(spesa => {
            const pagatoDa = Object.entries(spesa.pagamenti)
                .filter(([_, importo]) => importo > 0)
                .map(([erede, importo]) => `${erede} (${formatCurrency(importo)})`)
                .join(', ') || 'Nessuno';

            return `
                <tr>
                    <td>${spesa.data || '<em style="color:#999;">—</em>'}</td>
                    <td>${spesa.categoria}</td>
                    <td>${spesa.creditore}</td>
                    <td>${spesa.descrizione}</td>
                    <td class="currency">${formatCurrency(spesa.importo)}</td>
                    <td>${pagatoDa}</td>
                </tr>
            `;
        }).join('');
        return;
    }

    // 📱 Mobile portrait: CARD
    tbody.innerHTML = speseFiltrate.map(spesa => {
        const pagatoDa = Object.entries(spesa.pagamenti)
            .filter(([_, importo]) => importo > 0)
            .map(([erede, importo]) => `${erede} (${formatCurrency(importo)})`)
            .join(', ') || 'Nessuno';

        return `
            <tr class="spesa-card-row">
                <td colspan="6">
                    <div class="spesa-card">
                        <div class="spesa-card-header">
                            <div class="spesa-card-title">
                                <span class="spesa-card-data">${spesa.data || '—'}</span>
                                <span class="spesa-card-categoria">${spesa.categoria || ''}</span>
                            </div>
                            <div class="spesa-card-importo">${formatCurrency(spesa.importo)}</div>
                        </div>
                        <div class="spesa-card-body">
                            <div class="spesa-card-descrizione">${spesa.descrizione || ''}</div>
                            <div class="spesa-card-creditore"><strong>Creditore:</strong> ${spesa.creditore || ''}</div>
                            <div class="spesa-card-pagato"><strong>Pagato da:</strong> ${pagatoDa}</div>
                        </div>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}



function mostraTrasferimenti() {
    const tbody = document.querySelector('#tabellaTrasferimenti tbody');
    const thead = document.querySelector('#tabellaTrasferimenti thead');
    const cardMode = isMobileCardMode();

    if (thead) {
        thead.style.display = cardMode ? 'none' : 'table-header-group';
    }

    // 🖥️ Desktop / landscape: tabella classica
    if (!cardMode) {
        tbody.innerHTML = dati.trasferimenti.map(t => `
            <tr>
                <td>${t.data}</td>
                <td>${t.da}</td>
                <td>${t.a}</td>
                <td class="currency positive-amount">${formatCurrency(t.importo)}</td>
                <td>${t.note || ''}</td>
            </tr>
        `).join('');
        return;
    }

    // 📱 Mobile portrait: CARD
    tbody.innerHTML = dati.trasferimenti.map(t => `
        <tr class="trasf-card-row">
            <td colspan="5">
                <div class="trasf-card">
                    <div class="trasf-card-header">
                        <span class="trasf-card-data">${t.data || '—'}</span>
                        <span class="trasf-card-importo">${formatCurrency(t.importo)}</span>
                    </div>
                    <div class="trasf-card-body">
                        <div><strong>Da:</strong> ${t.da}</div>
                        <div><strong>A:</strong> ${t.a}</div>
                        ${t.note ? `<div class="trasf-card-note">${t.note}</div>` : ''}
                    </div>
                </div>
            </td>
        </tr>
    `).join('');
}



// ============================================================
// 🔢 Utility
// ============================================================

function formatCurrency(value) {
	return new Intl.NumberFormat('it-IT', {
		style: 'currency',
		currency: 'EUR'
	}).format(value);
}

function ordinaTabella(tipo, th) {
	const column = th.dataset.column;
	const dataType = th.dataset.type;
	const state = sortState[tipo];
	
	// Cambia direzione
	if (state.column === column) {
		state.direction = state.direction === 'asc' ? 'desc' : 'asc';
	} else {
		state.column = column;
		state.direction = 'asc';
	}
	
	// Rimuovi classi da tutti gli header
	th.parentElement.querySelectorAll('th').forEach(h => {
		h.classList.remove('sort-asc', 'sort-desc');
	});
	
	// Aggiungi classe all'header corrente
	th.classList.add(state.direction === 'asc' ? 'sort-asc' : 'sort-desc');
	
	// Ordina i dati
	const dataArray = tipo === 'spese' ? dati.spese : dati.trasferimenti;
	dataArray.sort((a, b) => {
		let valA = a[column];
		let valB = b[column];
		
		if (dataType === 'number') {
			valA = parseFloat(valA) || 0;
			valB = parseFloat(valB) || 0;
		} else {
			valA = String(valA).toLowerCase();
			valB = String(valB).toLowerCase();
		}
		
		if (valA < valB) return state.direction === 'asc' ? -1 : 1;
		if (valA > valB) return state.direction === 'asc' ? 1 : -1;
		return 0;
	});
	
	// Aggiorna visualizzazione
	if (tipo === 'spese') {
		mostraSpese();
	} else {
		mostraTrasferimenti();
	}
}

// ============================================================
// 📄 Esportazione PDF (parametrizzabile per ogni pagina)
// ============================================================

async function esportaPDF(opzioni = {}) {
    const {
        titolo = 'Dashboard Successione',
        nomeFile = 'successione_riepilogo.pdf',
        sottotitolo = 'Riepilogo pagamenti e trasferimenti'
    } = opzioni;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Titolo
    doc.setFontSize(20);
    doc.setTextColor(102, 126, 234);
    doc.text(titolo, 14, 20);

    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(sottotitolo, 14, 27);
    doc.text(`Generato il: ${new Date().toLocaleDateString('it-IT')}`, 14, 33);

    let yPos = 42;

    // -------------------------------
    // 💰 Riepilogo per Erede
    // -------------------------------
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text('Riepilogo per Erede', 14, yPos);
    yPos += 7;

    const riepilogoData = [];
    dati.eredi.forEach(erede => {
        const quota = dati.quote_percentuali[erede] / 100;
        const totaleImporti = dati.spese.reduce((sum, s) => sum + s.importo, 0);
        const dovuto = totaleImporti * quota;
        const pagato = dati.spese.reduce((sum, s) => sum + (s.pagamenti[erede] || 0), 0);
        const trasferimentiRicevuti = dati.trasferimenti.filter(t => t.a === erede).reduce((sum, t) => sum + t.importo, 0);
        const trasferimentiInviati = dati.trasferimenti.filter(t => t.da === erede).reduce((sum, t) => sum + t.importo, 0);
        const saldo = dovuto - pagato + trasferimentiRicevuti - trasferimentiInviati;

        riepilogoData.push([
            erede,
            formatCurrency(dovuto),
            formatCurrency(pagato),
            formatCurrency(trasferimentiRicevuti),
            formatCurrency(trasferimentiInviati),
            formatCurrency(saldo)
        ]);
    });

    doc.autoTable({
        startY: yPos,
        head: [['Erede', 'Dovuto', 'Pagato', 'Trasf. Ric.', 'Trasf. Inv.', 'Saldo']],
        body: riepilogoData,
        theme: 'grid',
        headStyles: { fillColor: [102, 126, 234] },
        margin: { left: 14, right: 14 }
    });

    yPos = doc.lastAutoTable.finalY + 10;

    // -------------------------------
    // 🎯 Chi deve a chi (grafico)
    // -------------------------------
    doc.setFontSize(14);
    doc.text('Saldo per Erede', 14, yPos);
    yPos += 7;

    const saldi = {};
    dati.eredi.forEach(erede => {
        const quota = dati.quote_percentuali[erede] / 100;
        const totaleImporti = dati.spese.reduce((sum, s) => sum + s.importo, 0);
        const dovuto = totaleImporti * quota;
        const pagato = dati.spese.reduce((sum, s) => sum + (s.pagamenti[erede] || 0), 0);
        const trasferimentiRicevuti = dati.trasferimenti.filter(t => t.a === erede).reduce((sum, t) => sum + t.importo, 0);
        const trasferimentiInviati = dati.trasferimenti.filter(t => t.da === erede).reduce((sum, t) => sum + t.importo, 0);
        saldi[erede] = dovuto - pagato + trasferimentiRicevuti - trasferimentiInviati;
    });

    const eredi = Object.keys(saldi);
    const valori = Object.values(saldi);

    // Dimensioni del grafico
    const chartLeft = 20;
    const chartWidth = 170;
    const chartTop = yPos + 10;
    const chartHeight = 70;
    const chartBottom = chartTop + chartHeight;
    const zeroY = chartTop + (chartHeight * (Math.max(...valori) / (Math.max(...valori) - Math.min(...valori))));

    // Assi (con linea dello zero ben visibile)
    doc.setDrawColor(0);
    doc.setLineWidth(0.8);
    doc.line(chartLeft, zeroY, chartLeft + chartWidth, zeroY);
    doc.setDrawColor(180);
    doc.setLineWidth(0.5);
    doc.line(chartLeft, chartTop, chartLeft, chartBottom);

    // Barre verticali
    const barWidth = chartWidth / eredi.length - 8;
    eredi.forEach((nome, i) => {
        const saldo = saldi[nome];
        const barX = chartLeft + i * (barWidth + 8);
        const barHeight = (Math.abs(saldo) / Math.max(...valori.map(v => Math.abs(v)))) * (chartHeight / 2);
        const barY = saldo >= 0 ? zeroY - barHeight : zeroY;

        doc.setFillColor(saldo >= 0 ? 235 : 17, saldo >= 0 ? 51 : 153, saldo >= 0 ? 73 : 142);
        doc.rect(barX, barY, barWidth, barHeight, 'F');

        // Etichetta importo
        const labelY = saldo >= 0 ? barY - 3 : barY + barHeight + 5;
        doc.setFontSize(8);
        doc.text(formatCurrency(saldo), barX + barWidth / 2, labelY, { align: 'center' });

        // Nome erede
        doc.setFontSize(9);
        doc.text(nome, barX + barWidth / 2, chartBottom + 10, { align: 'center' });
    });

    // Legenda
    doc.setFontSize(9);
    doc.text('Rosso: deve versare la cifra indicata', chartLeft, chartBottom + 16);
    doc.text('Verde: deve ricevere la cifra indicata', chartLeft + 90, chartBottom + 16);

    // -------------------------------
    // 📊 Elenco Spese
    // -------------------------------
    doc.addPage();
    yPos = 20;
    doc.setFontSize(14);
    doc.text('Elenco Spese', 14, yPos);
    yPos += 7;

    const speseData = dati.spese.map(spesa => {
        const pagatoDa = Object.entries(spesa.pagamenti)
            .filter(([_, importo]) => importo > 0)
            .map(([erede, _]) => erede)
            .join(', ') || 'Nessuno';
        return [
            spesa.data || '—',
            spesa.categoria,
            spesa.creditore,
            spesa.descrizione,
            formatCurrency(spesa.importo),
            pagatoDa
        ];
    });

    doc.autoTable({
        startY: yPos,
        head: [['Data', 'Categoria', 'Creditore', 'Descrizione', 'Importo', 'Pagato da']],
        body: speseData,
        theme: 'grid',
        headStyles: { fillColor: [102, 126, 234] },
        margin: { left: 14, right: 14 },
        styles: { fontSize: 8 }
    });

    // Salvataggio
    doc.save(nomeFile);
}
