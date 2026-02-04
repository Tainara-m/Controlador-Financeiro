import { supabase } from "./supabaseClient.js";

const $ = (s) => document.querySelector(s);

const MONTHS = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"
];

function money(n, currency = "BRL") {
  return (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency });
}

function setStatus(text, type = "ok") {
  const el = $("#saveStatus");
  if (!el) return;
  el.textContent = text;
  el.dataset.type = type;
}

function groupSum(rows, keyFn) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    const v = Number(r.amount) || 0;
    map.set(k, (map.get(k) || 0) + v);
  }
  return Array.from(map.entries()).sort((a,b) => b[1] - a[1]);
}

function buildYearOptions(selectEl, currentYear) {
  const years = Array.from({ length: 6 }, (_, i) => currentYear - i);
  selectEl.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join("");
}

async function fetchYearRows(userId, year) {
  const { data, error } = await supabase
    .from("transactions")
    .select("id, month, type, category, income_type, amount")
    .eq("user_id", userId)
    .eq("year", year);

  if (error) throw error;
  return data || [];
}

function buildMonthBuckets(rows) {
  const buckets = Array.from({ length: 12 }, () => ({ in: 0, out: 0 }));
  for (const r of rows) {
    const idx = (Number(r.month) || 1) - 1;
    if (idx < 0 || idx > 11) continue;
    const v = Number(r.amount) || 0;
    if (r.type === "entrada") buckets[idx].in += v;
    else buckets[idx].out += v;
  }
  return buckets;
}

function calcYearKPIsFromBuckets(buckets) {
  const inTotal = buckets.reduce((a,b) => a + b.in, 0);
  const outTotal = buckets.reduce((a,b) => a + b.out, 0);
  return { inTotal, outTotal, bal: inTotal - outTotal };
}

/* ===========================
   Incentivo: gatinhos do mês
   (use a mesma pasta do mes.html)
=========================== */
const KITTIES = {
  desesperado: { src: "./assets/cats/desesperado.png", title: "Desesperado" },
  chorando:    { src: "./assets/cats/chorando.png",    title: "Chorando" },
  triste:      { src: "./assets/cats/triste.png",      title: "Triste" },
  normal:      { src: "./assets/cats/normal.png",      title: "Ok" },
  feliz:       { src: "./assets/cats/feliz.png",       title: "Feliz" }
};

function pickKittyByRate(ratePct) {
  if (ratePct <= 0) return KITTIES.desesperado;
  if (ratePct < 5)  return KITTIES.chorando;
  if (ratePct < 15) return KITTIES.triste;
  if (ratePct < 30) return KITTIES.normal;
  return KITTIES.feliz;
}

function kittyForMonth(b) {
  // ratePct = (saldo / entradas) * 100
  const bal = b.in - b.out;
  const ratePct = b.in > 0 ? (bal / b.in) * 100 : 0;
  return { ...pickKittyByRate(ratePct), ratePct, bal };
}

/* ===========================
   Gráfico anual (barras + linha)
   + plugin datalabels
   + destaque mês atual
   + toggle YTD
=========================== */
let yearChart = null;

function buildBarColors(baseColor, count, highlightIndex) {
  // deixa mês atual um pouco mais forte (mesmo tom)
  return Array.from({ length: count }, (_, i) => {
    if (i === highlightIndex) return baseColor; // já é a cor
    return baseColor; // mantemos padronizado (sem variar), só destacamos via borda
  });
}


const COLOR_IN = "#20c997";
const COLOR_OUT = "#ff6b6b";
const COLOR_HI = "#6b5cff"; // highlight mês atual (borda)

function renderYearChart({ labels, inData, outData, currency, highlightIndex }) {
  const canvas = document.getElementById("yearChart");
  if (!canvas) return;

  if (!window.Chart) {
    console.error("[ANUAL] Chart.js não carregou.");
    return;
  }

  const hasDL = !!window.ChartDataLabels;
  if (yearChart) yearChart.destroy();

  // helper: borda no mês atual
  const borderWidths = labels.map((_, i) => (i === highlightIndex ? 2 : 0));
  const borderColors = labels.map((_, i) => (i === highlightIndex ? COLOR_HI : "transparent"));

  yearChart = new Chart(canvas, {
    plugins: hasDL ? [window.ChartDataLabels] : [],
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Entradas",
          data: inData,
          backgroundColor: COLOR_IN,
          borderColor: borderColors,
          borderWidth: borderWidths,
          borderRadius: 10,
          barThickness: 18
        },
        {
          label: "Saídas",
          data: outData,
          backgroundColor: COLOR_OUT,
          borderColor: borderColors,
          borderWidth: borderWidths,
          borderRadius: 10,
          barThickness: 18
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const v = Number(ctx.raw || 0);
              return `${ctx.dataset.label}: ${v.toLocaleString("pt-BR", { style: "currency", currency })}`;
            }
          }
        },
        datalabels: hasDL ? {
          color: "#111",
          anchor: "end",
          align: "top",
          offset: 2,
          font: { weight: "700" },
          formatter: (v) => {
            const n = Number(v || 0);
            if (n <= 0) return "";
            return n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
          }
        } : undefined
      },
      scales: {
        y: {
          ticks: {
            callback: (v) =>
              Number(v).toLocaleString("pt-BR", { style: "currency", currency, maximumFractionDigits: 0 })
          },
          grid: { drawBorder: false }
        },
        x: { grid: { display: false } }
      }
    }
  });
}

/* ===========================
   Render: resumo mensal com gatinho
=========================== */
function renderMonthsGrid(year, buckets, currency, highlightIndex) {
  const wrap = $("#monthsGrid");
  if (!wrap) return;

  wrap.innerHTML = buckets.map((b, i) => {
    const bal = b.in - b.out;
    const href = `mes.html?ano=${year}&mes=${i+1}`;

    const k = kittyForMonth(b);
    const isCurrent = i === highlightIndex;

    return `
      <a class="month-card" href="${href}">
        <div class="month-kitty" title="${k.title}">
          <img src="${k.src}" alt="Gatinho do mês">
        </div>

        <div class="month-info">
          <div class="row-between">
            <div class="month-name">${MONTHS[i]}</div>
            <span class="month-badge ${isCurrent ? "is-current" : ""}">
              ${k.ratePct.toFixed(1)}%
            </span>
          </div>

          <div class="month-lines">
            <div class="mn-row"><span class="mn-muted">Entradas</span><strong>${money(b.in, currency)}</strong></div>
            <div class="mn-row"><span class="mn-muted">Saídas</span><strong>${money(b.out, currency)}</strong></div>
            <div class="mn-row"><span class="mn-muted">Saldo</span><strong>${money(bal, currency)}</strong></div>
          </div>
        </div>
      </a>
    `;
  }).join("");
}

function renderTopList(containerId, pairs, currency, emptyMsg) {
  const wrap = document.querySelector(containerId);
  if (!wrap) return;

  if (!pairs.length) {
    wrap.innerHTML = `<p class="muted">${emptyMsg}</p>`;
    return;
  }

  wrap.innerHTML = pairs.slice(0, 8).map(([label, value]) => `
    <div class="list-row">
      <span class="list-label">${label}</span>
      <strong class="list-value">${money(value, currency)}</strong>
    </div>
  `).join("");
}

export async function initAnualPage() {
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return;

  // moeda do profile
  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("currency")
    .eq("id", user.id)
    .single();

  if (pErr) {
    console.error(pErr);
    setStatus("Erro profile", "err");
    return;
  }

  const currency = profile?.currency || "BRL";

  const yearSelect = $("#yearSelect");
  const ytdToggle = $("#ytdToggle");
  const currentYear = new Date().getFullYear();
  buildYearOptions(yearSelect, currentYear);

  // URL (?ano=2026)
  const params = new URLSearchParams(window.location.search);
  const urlYear = Number(params.get("ano"));
  const initialYear = urlYear || currentYear;
  yearSelect.value = String(initialYear);

  // destaque mês atual apenas se o ano selecionado == ano atual
  const now = new Date();
  const currentMonthIndex = now.getMonth(); // 0..11

  let cachedRows = [];
  let cachedBuckets = [];

  function applyRange(buckets, year, ytdOn) {
    if (!ytdOn) return buckets;

    // se não for ano atual, "até mês atual" não faz muito sentido
    // mas vamos aplicar do mesmo jeito (até mês atual do calendário)
    const limit = (year === now.getFullYear()) ? (currentMonthIndex + 1) : 12;
    return buckets.slice(0, limit);
  }

  function refreshUI(year, ytdOn) {
    const highlightIndex = (year === now.getFullYear()) ? currentMonthIndex : -1;

    const fullBuckets = cachedBuckets;
    const viewBuckets = applyRange(fullBuckets, year, ytdOn);

    // KPIs do recorte (ano inteiro ou YTD)
    const k = calcYearKPIsFromBuckets(viewBuckets);
    $("#kpiInYear").textContent = money(k.inTotal, currency);
    $("#kpiOutYear").textContent = money(k.outTotal, currency);
    $("#kpiBalYear").textContent = money(k.bal, currency);

    // Hint do gráfico
    const hint = $("#chartHint");
    if (hint) hint.textContent = ytdOn ? "Modo: até mês atual" : "Modo: ano inteiro";

    // chart data
    const labels = viewBuckets.map((_, i) => MONTHS[i]);
    const inData = viewBuckets.map(b => b.in);
    const outData = viewBuckets.map(b => b.out);
    const balData = viewBuckets.map(b => b.in - b.out);

    // highlight dentro do range
    const hi = (highlightIndex >= 0 && highlightIndex < labels.length) ? highlightIndex : -1;

renderYearChart({ labels, inData, outData, currency, highlightIndex: hi });
    // resumo mensal com gatinhos
    renderMonthsGrid(year, viewBuckets, currency, hi);

    // tops do recorte (ano inteiro ou YTD) a partir das rows originais filtradas pelo range
    const allowedMonths = new Set(viewBuckets.map((_, i) => i + 1));
    const rowsView = cachedRows.filter(r => allowedMonths.has(Number(r.month)));

    const outTop = groupSum(rowsView.filter(r => r.type === "saida"), r => r.category || "Outros");
    const inTop  = groupSum(rowsView.filter(r => r.type === "entrada"), r => r.income_type || "Outros");

    renderTopList("#topOutCats", outTop, currency, "Ainda não há saídas nesse período.");
    renderTopList("#topInTypes", inTop, currency, "Ainda não há entradas nesse período.");

    setStatus("OK", "ok");
  }

  async function loadYear(year) {
    try {
      setStatus("Carregando…", "warn");

      cachedRows = await fetchYearRows(user.id, year);
      cachedBuckets = buildMonthBuckets(cachedRows);

      // atualiza URL sem recarregar
      const u = new URL(window.location.href);
      u.searchParams.set("ano", String(year));
      window.history.replaceState({}, "", u.toString());

      refreshUI(year, !!ytdToggle?.checked);
    } catch (err) {
      console.error(err);
      setStatus("Erro", "err");
      alert(err?.message || "Erro ao carregar o anual.");
    }
  }

  yearSelect.addEventListener("change", async () => {
    await loadYear(Number(yearSelect.value));
  });

  ytdToggle?.addEventListener("change", () => {
    refreshUI(Number(yearSelect.value), !!ytdToggle.checked);
  });

  await loadYear(initialYear);
}
