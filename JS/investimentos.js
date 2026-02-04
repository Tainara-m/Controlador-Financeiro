import { supabase } from "./supabaseClient.js";

const $ = (s) => document.querySelector(s);

function setStatus(text, type = "ok") {
  const el = $("#saveStatus");
  if (!el) return;
  el.textContent = text;
  el.dataset.type = type;
}

function money(n, currency = "BRL") {
  return (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency });
}

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

function groupSum(rows, key) {
  const map = new Map();
  for (const r of rows) {
    const k = r[key] || "Outros";
    const v = Number(r.amount) || 0;
    map.set(k, (map.get(k) || 0) + v);
  }
  return Array.from(map.entries()).sort((a,b) => b[1] - a[1]);
}

let pieChart = null;
function renderPie(labels, values, currency) {
  const canvas = document.getElementById("pieInv");
  if (!canvas || !window.Chart) return;

  if (pieChart) pieChart.destroy();

  pieChart = new Chart(canvas, {
    type: "pie",
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: labels.map(colorFor),
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.label}: ${money(ctx.raw, currency)}`
          }
        }
      }
    }
  });
}

export async function initInvestimentosPage() {
  const { data: ud } = await supabase.auth.getUser();
  const user = ud.user;
  if (!user) return;

  // moeda do profile
  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("currency")
    .eq("id", user.id)
    .single();

  if (pErr) {
    console.error(pErr);
    alert("Erro ao carregar perfil.");
    return;
  }

  const currency = profile?.currency || "BRL";
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth() + 1;

  // default date = hoje
  const invDate = $("#invDate");
  if (invDate) invDate.value = now.toISOString().slice(0, 10);

  // ===== saldo do mês (base) via transactions =====
  async function fetchMonthBalance() {
    const { data, error } = await supabase
      .from("transactions")
      .select("type, amount")
      .eq("user_id", user.id)
      .eq("year", curYear)
      .eq("month", curMonth);

    if (error) throw error;

    const rows = data || [];
    const inTotal = rows.filter(r => r.type === "entrada").reduce((a, r) => a + (Number(r.amount) || 0), 0);
    const outTotal = rows.filter(r => r.type === "saida").reduce((a, r) => a + (Number(r.amount) || 0), 0);
    return inTotal - outTotal;
  }

  // ===== investimentos do ano =====
  async function fetchYearInvestments() {
    const { data, error } = await supabase
      .from("investments")
      .select("id, date, category, place, amount")
      .eq("user_id", user.id)
      .eq("year", curYear)
      .order("date", { ascending: false });

    if (error) throw error;
    return data || [];
  }

  let monthBalance = 0;
  let cached = [];

  function renderKPIs() {
    $("#kpiMonthBalance").textContent = money(monthBalance, currency);

    const totalYear = cached.reduce((a, r) => a + (Number(r.amount) || 0), 0);
    $("#kpiYearInvested").textContent = money(totalYear, currency);

    const grouped = groupSum(cached, "category");
    const labels = grouped.map(([k]) => k);
    const values = grouped.map(([,v]) => v);

    if (!labels.length) {
      renderPie(["Sem dados"], [1], currency);
    } else {
      renderPie(labels, values, currency);
    }
  }

  function getFiltered() {
    const q = ($("#invSearch")?.value || "").trim().toLowerCase();
    const cat = ($("#invFilterCat")?.value || "").trim();

    return cached.filter(r => {
      const okCat = !cat || r.category === cat;
      const hay = `${r.category || ""} ${r.place || ""} ${r.amount || ""}`.toLowerCase();
      const okQ = !q || hay.includes(q);
      return okCat && okQ;
    });
  }

  function renderTable(rows) {
    const wrap = $("#invTable");
    if (!wrap) return;

    if (!rows.length) {
      wrap.innerHTML = `<p class="muted">Nenhum aporte lançado neste ano.</p>`;
      return;
    }

    wrap.innerHTML = `
      <div class="tl-head">
        <span>Data</span>
        <span>Destino</span>
        <span>Local</span>
        <span>Valor</span>
        <span></span>
      </div>
      ${rows.map(r => `
        <div class="tl-row">
          <span>${new Date(r.date).toLocaleDateString("pt-BR")}</span>
          <span>${r.category}</span>
          <span>${r.place || "—"}</span>
          <span>${money(r.amount, currency)}</span>
          <button class="btn danger" data-del="${r.id}" type="button">Excluir</button>
        </div>
      `).join("")}
    `;
  }

  async function refresh() {
    monthBalance = await fetchMonthBalance();
    cached = await fetchYearInvestments();
    renderKPIs();
    renderTable(getFiltered());
  }

  // importar saldo para o campo valor
  $("#importBalanceBtn")?.addEventListener("click", () => {
    $("#invAmount").value = String(Math.max(0, Number(monthBalance || 0)).toFixed(2));
  });

  // criar aporte
  $("#invForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();

    try {
      setStatus("Salvando…", "warn");

      const date = $("#invDate")?.value;
      const category = $("#invCategory")?.value;
      const place = ($("#invPlace")?.value || "").trim() || null;
      const amount = Number($("#invAmount")?.value || 0);

      if (!date || !category || !amount || amount <= 0) {
        setStatus("Preencha os campos obrigatórios", "err");
        return;
      }

      // validação leve: não deixa investir mais que o saldo do mês (se saldo negativo/zero, não trava, só alerta)
      if (monthBalance > 0 && amount > monthBalance) {
        if (!confirm("Esse valor é maior que o saldo do mês. Deseja continuar mesmo assim?")) {
          setStatus("Cancelado", "warn");
          return;
        }
      }

      const payload = {
        user_id: user.id,
        date,
        year: curYear,
        category,
        place,
        amount
      };

      const { error } = await supabase.from("investments").insert(payload);
      if (error) throw error;

      // limpa
      $("#invPlace").value = "";
      $("#invAmount").value = "";

      await refresh();
      setStatus("Salvo", "ok");
    } catch (err) {
      console.error(err);
      setStatus("Erro", "err");
      alert(err?.message || "Erro ao salvar aporte.");
    }
  });

  // excluir
  $("#invTable")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-del]");
    if (!btn) return;

    if (!confirm("Excluir este aporte?")) return;

    try {
      setStatus("Excluindo…", "warn");
      const { error } = await supabase.from("investments").delete().eq("id", btn.dataset.del);
      if (error) throw error;

      await refresh();
      setStatus("OK", "ok");
    } catch (err) {
      console.error(err);
      setStatus("Erro", "err");
      alert(err?.message || "Erro ao excluir.");
    }
  });

  // filtros
  $("#invSearch")?.addEventListener("input", () => renderTable(getFiltered()));
  $("#invFilterCat")?.addEventListener("change", () => renderTable(getFiltered()));

  await refresh();
}
