// js/mes.js
import { supabase } from "./supabaseClient.js";

const $ = (s) => document.querySelector(s);

function money(n, currency = "BRL") {
  return (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency });
}

function setStatus(text, type = "ok") {
  const el = $("#saveStatus");
  if (!el) return;
  el.textContent = text;
  el.dataset.type = type;
}

function getMonthName(m) {
  return [
    "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
    "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"
  ][m - 1];
}

function setISODateInput(id, dateObj) {
  const el = $(id);
  if (!el) return;
  el.value = dateObj.toISOString().slice(0, 10);
}

/* ===========================
   Charts: paleta padronizada
=========================== */
const PALETTE = [
  "#6b5cff", "#20c997", "#f59f00", "#ff6b6b", "#4f46e5",
  "#06b6d4", "#22c55e", "#fb7185", "#a78bfa", "#f97316"
];

function hashIndex(str, mod) {
  let h = 0;
  const s = String(str || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % mod;
}

function colorFor(label) {
  return PALETTE[hashIndex(label, PALETTE.length)];
}

function groupSum(rows, keyFn) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    const v = Number(r.amount) || 0;
    map.set(k, (map.get(k) || 0) + v);
  }
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
}

/* ===========================
   Incentivo: gatinhos
=========================== */
const KITTIES = {
  desesperado: {
    src: "assets/cats/desesperado.png",
    title: "Calma… vai dar certo",
    hint: "Você fechou o mês no negativo ou zerado. Que tal revisar gastos fixos?"
  },
  chorando: {
    src: "assets/cats/chorando.png",
    title: "Dá pra melhorar",
    hint: "Seu saldo está baixo. Pequenos ajustes já mudam o jogo."
  },
  triste: {
    src: "assets/cats/triste.png",
    title: "Tá ok, mas atenção",
    hint: "Saldo positivo, porém com folga pequena. Vamos buscar mais margem."
  },
  normal: {
    src: "assets/cats/normal.png",
    title: "Bom trabalho",
    hint: "Você está mantendo um saldo saudável. Continue consistente."
  },
  feliz: {
    src: "assets/cats/feliz.png",
    title: "Excelente!",
    hint: "Saldo alto no mês. Você está mandando muito bem!"
  }
};

function pickKittyByRate(ratePct) {
  if (ratePct <= 0) return KITTIES.desesperado;
  if (ratePct < 5) return KITTIES.chorando;
  if (ratePct < 15) return KITTIES.triste;
  if (ratePct < 30) return KITTIES.normal;
  return KITTIES.feliz;
}

let pieInChart = null;
let pieOutChart = null;

function renderPie(canvasId, labels, values) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !window.Chart) return null;

  const data = {
    labels,
    datasets: [{
      data: values,
      backgroundColor: labels.map(colorFor),
      borderWidth: 0
    }]
  };

  return new Chart(canvas, {
    type: "pie",
    data,
    options: {
      responsive: true,
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: (item) => {
              const v = item.raw || 0;
              return `${item.label}: ${v.toLocaleString("pt-BR", {
                style: "currency",
                currency: window.__currency || "BRL"
              })}`;
            }
          }
        }
      }
    }
  });
}

export async function initMonthPage() {
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return;

  // ===== Estado local do mês =====
  let cachedRows = [];

  // Busca e filtro (se existirem no HTML)
  const searchEl = document.querySelector("#txSearch");
  const filterEl = document.querySelector("#txFilterType");

  function getFilteredRows() {
    const q = (searchEl?.value || "").trim().toLowerCase();
    const t = (filterEl?.value || "");

    return cachedRows.filter(r => {
      const okType = !t || r.type === t;
      const hay = `${r.description || ""} ${r.category || ""} ${r.payment_method || ""} ${r.income_type || ""}`.toLowerCase();
      const okQ = !q || hay.includes(q);
      return okType && okQ;
    });
  }

  // lê ano/mês da URL
  const params = new URLSearchParams(window.location.search);
  const year = Number(params.get("ano"));
  const month = Number(params.get("mes"));

  if (!year || !month || month < 1 || month > 12) {
    alert("Ano ou mês inválido.");
    window.location.href = "index.html";
    return;
  }

  // profile
  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("categories, payment_methods, income_types, currency")
    .eq("id", user.id)
    .single();

  if (pErr) {
    console.error(pErr);
    alert("Erro ao carregar perfil.");
    return;
  }

  const categories = Array.isArray(profile.categories) ? profile.categories : [];
  const payments = Array.isArray(profile.payment_methods) ? profile.payment_methods : [];
  const incomeTypes = Array.isArray(profile.income_types) ? profile.income_types : [];
  const currency = profile.currency || "BRL";
  window.__currency = currency;

  // título
  $("#monthTitle") && ($("#monthTitle").textContent = `${getMonthName(month)} / ${year}`);
  $("#monthSubtitle") && ($("#monthSubtitle").textContent = `Lançamentos de ${getMonthName(month)} de ${year}`);

  // default date (hoje se mesmo mês/ano, senão 01)
  const today = new Date();
  const defaultDate =
    (today.getFullYear() === year && (today.getMonth() + 1) === month)
      ? today
      : new Date(year, month - 1, 1);

  setISODateInput("#txDate", defaultDate);

  // selects do form
  const catSelect = $("#txCategory");
  if (catSelect) {
    const safeCats = categories.length ? categories : ["Outros"];
    catSelect.innerHTML = safeCats.map(c => `<option value="${c}">${c}</option>`).join("");
  }

  const paySelect = $("#txPayment");
  if (paySelect) {
    paySelect.innerHTML = payments.length
      ? `<option value="">—</option>` + payments.map(p => `<option value="${p}">${p}</option>`).join("")
      : `<option value="">—</option>`;
  }

  const incomeSelect = $("#txIncomeType");
  if (incomeSelect) {
    incomeSelect.innerHTML =
      `<option value="">—</option>` +
      incomeTypes.map(t => `<option value="${t}">${t}</option>`).join("");
  }

  // tipo entrada habilita/desabilita + desabilita categorias no modo entrada
  const txType = $("#txType");
  function updateIncomeType() {
    if (!incomeSelect || !txType) return;

    const catSel = $("#txCategory");

    if (txType.value === "entrada") {
      incomeSelect.disabled = false;

      // categoria visualmente desabilitada, mas garantimos valor padrão
      if (catSel) {
        catSel.value = "Outros";
        catSel.disabled = true;
      }
    } else {
      incomeSelect.value = "";
      incomeSelect.disabled = true;

      if (catSel) catSel.disabled = false;
    }
  }

  updateIncomeType();
  txType?.addEventListener("change", updateIncomeType);

  // Navegação mês/ano
  const monthNav = $("#monthNavSelect");
  const yearNav = $("#yearNavSelect");
  const prevBtn = $("#prevMonthBtn");
  const nextBtn = $("#nextMonthBtn");

  const goTo = (y, m) => {
    window.location.href = `mes.html?ano=${y}&mes=${m}`;
  };

  if (monthNav && yearNav) {
    monthNav.innerHTML = Array.from({ length: 12 }, (_, i) => {
      const mm = i + 1;
      return `<option value="${mm}">${getMonthName(mm)}</option>`;
    }).join("");

    const curY = new Date().getFullYear();
    const years = Array.from({ length: 6 }, (_, i) => curY - i);
    yearNav.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join("");

    monthNav.value = String(month);
    yearNav.value = String(year);

    monthNav.addEventListener("change", () => goTo(Number(yearNav.value), Number(monthNav.value)));
    yearNav.addEventListener("change", () => goTo(Number(yearNav.value), Number(monthNav.value)));

    prevBtn?.addEventListener("click", () => {
      let y = Number(yearNav.value);
      let m = Number(monthNav.value) - 1;
      if (m < 1) { m = 12; y -= 1; }
      goTo(y, m);
    });

    nextBtn?.addEventListener("click", () => {
      let y = Number(yearNav.value);
      let m = Number(monthNav.value) + 1;
      if (m > 12) { m = 1; y += 1; }
      goTo(y, m);
    });
  }

  // ===== Dados =====
  async function fetchTransactions() {
    const { data, error } = await supabase
      .from("transactions")
      .select("id, date, type, category, payment_method, description, amount, income_type")
      .eq("user_id", user.id)
      .eq("year", year)
      .eq("month", month)
      .order("date", { ascending: true });

    if (error) throw error;
    return data || [];
  }

  function renderKPIs(rows) {
    const inRows = rows.filter(r => r.type === "entrada");
    const outRows = rows.filter(r => r.type === "saida");

    const inTotal = inRows.reduce((a, r) => a + (Number(r.amount) || 0), 0);
    const outTotal = outRows.reduce((a, r) => a + (Number(r.amount) || 0), 0);
    const bal = inTotal - outTotal;

    $("#kpiIn") && ($("#kpiIn").textContent = money(inTotal, currency));
    $("#kpiOut") && ($("#kpiOut").textContent = money(outTotal, currency));
    $("#kpiBal") && ($("#kpiBal").textContent = money(bal, currency));

    // Incentivo do mês
    const ratePct = inTotal > 0 ? (bal / inTotal) * 100 : 0;
    const kitty = pickKittyByRate(ratePct);

    const img = $("#kittyImg");
    const title = $("#kittyTitle");
    const hint = $("#kittyHint");
    const chip = $("#kittyRateChip");

    if (img) img.src = kitty.src;
    if (title) title.textContent = kitty.title;
    if (hint) hint.textContent = kitty.hint;
    if (chip) chip.textContent = `Saldo: ${ratePct.toFixed(1)}%`;

    // Pizza Entradas (por income_type)
    const inGrouped = groupSum(inRows, r => (r.income_type || "Outros"));
    const inLabels = inGrouped.map(([k]) => k);
    const inValues = inGrouped.map(([, v]) => v);

    if (pieInChart) pieInChart.destroy();
    pieInChart = renderPie("pieIn", inLabels, inValues);

    // Pizza Saídas (por categoria)
    const outGrouped = groupSum(outRows, r => (r.category || "Outros"));
    const outLabels = outGrouped.map(([k]) => k);
    const outValues = outGrouped.map(([, v]) => v);

    if (pieOutChart) pieOutChart.destroy();
    pieOutChart = renderPie("pieOut", outLabels, outValues);

    // Saldo no rodapé (se existir)
    const fb = document.querySelector("#footerBalance");
    if (fb) fb.textContent = money(bal, currency);
  }

  function renderTable(rows) {
    const wrap = $("#txTable");
    if (!wrap) return;

    if (!rows.length) {
      wrap.innerHTML = `<p class="muted">Nenhum lançamento neste mês.</p>`;
      return;
    }

    wrap.innerHTML = `
      <div class="tl-head">
        <span>Data</span>
        <span>Tipo</span>
        <span>Detalhe</span>
        <span>Categoria</span>
        <span>Método</span>
        <span>Valor</span>
        <span></span>
      </div>
      ${rows.map(r => `
        <div class="tl-row">
          <span>${new Date(r.date).toLocaleDateString("pt-BR")}</span>
          <span>${r.type}</span>
          <span>${r.type === "entrada" ? (r.income_type || "—") : "—"}</span>
          <span>${r.category}</span>
          <span>${r.payment_method || "—"}</span>
          <span>${money(r.amount, currency)}</span>
          <button class="btn danger" data-del="${r.id}" type="button">Excluir</button>
        </div>
      `).join("")}
    `;
  }

  async function refresh() {
    cachedRows = await fetchTransactions();
    renderKPIs(cachedRows);
    renderTable(getFilteredRows());
  }

  // Inserir
  $("#txForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();

    try {
      setStatus("Salvando…", "warn");

      const type = $("#txType")?.value;

      const income_type =
        type === "entrada"
          ? ($("#txIncomeType")?.value || null)
          : null;

      // ✅ category SEMPRE preenchida (DB exige NOT NULL)
      const category =
        type === "entrada"
          ? "Outros"
          : ($("#txCategory")?.value || "Outros");

      const amount = Number($("#txAmount")?.value || 0);

      const payload = {
        user_id: user.id,
        year,
        month,
        date: $("#txDate")?.value,
        type,
        income_type,
        category,
        payment_method: $("#txPayment")?.value || null,
        description: ($("#txDesc")?.value || "").trim() || null,
        amount
      };

      // validações
      if (!payload.date || !payload.type || !(amount > 0)) {
        setStatus("Preencha corretamente os campos", "err");
        return;
      }

      if (type === "entrada" && !payload.income_type) {
        setStatus("Escolha o tipo de entrada", "err");
        return;
      }

      const { data: insData, error: insErr } = await supabase
        .from("transactions")
        .insert(payload)
        .select("id")
        .single();

      if (insErr) {
        console.error("[TX] insert error", insErr);
        setStatus("Erro ao salvar", "err");
        alert(`INSERT ERROR:\n${insErr.message}\n\n${JSON.stringify(insErr, null, 2)}`);
        return;
      }

      console.log("[TX] insert ok", insData);

      $("#txForm")?.reset();
      setISODateInput("#txDate", defaultDate);
      updateIncomeType();

      await refresh();
      setStatus("Salvo", "ok");
    } catch (err) {
      console.error("[TX] catch", err);
      setStatus("Erro ao salvar", "err");
      alert(`CATCH:\n${err?.message || ""}`);
    }
  });

  // Excluir
  $("#txTable")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-del]");
    if (!btn) return;

    if (!confirm("Excluir este lançamento?")) return;

    try {
      setStatus("Salvando…", "warn");
      const { error } = await supabase.from("transactions").delete().eq("id", btn.dataset.del);
      if (error) throw error;

      await refresh();
      setStatus("Salvo", "ok");
    } catch (err) {
      console.error(err);
      setStatus("Erro ao excluir", "err");
      alert(err?.message || "Erro ao excluir.");
    }
  });

  // Busca e filtro (se existirem)
  searchEl?.addEventListener("input", () => renderTable(getFilteredRows()));
  filterEl?.addEventListener("change", () => renderTable(getFilteredRows()));

  // Bottom-nav auto-hide (se existir)
  const nav = document.querySelector("#bottomNav");
  if (nav) {
    let lastY = window.scrollY;
    let ticking = false;

    const onScroll = () => {
      const y = window.scrollY;
      const goingDown = y > lastY;
      const delta = Math.abs(y - lastY);
      if (delta < 8) return;

      if (goingDown && y > 120) nav.classList.add("is-hidden");
      else nav.classList.remove("is-hidden");

      lastY = y;
    };

    window.addEventListener("scroll", () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        onScroll();
        ticking = false;
      });
    }, { passive: true });
  }

  await refresh();
}
