import { supabase } from "./supabaseClient.js";

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

function setStatus(text, type = "ok") {
  const el = $("#saveStatus");
  if (!el) return;
  el.textContent = text;
  el.dataset.type = type;
}

function money(n, currency = "BRL") {
  const v = Number(n) || 0;
  return v.toLocaleString("pt-BR", { style: "currency", currency });
}

function escapeHtml(str) {
  return (str || "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[m]));
}

function toCsv(rows) {
  const headers = ["Ano","Tipo","Descrição","Beneficiário","CPF/CNPJ","Valor"];
  const lines = [headers.join(";")];

  for (const r of rows) {
    const vals = [
      r.year,
      r.deduction_type,
      r.description,
      r.beneficiary || "",
      r.document || "",
      String(r.amount).replace(".", ","),
    ].map(v => `"${String(v).replace(/"/g,'""')}"`);
    lines.push(vals.join(";"));
  }
  return lines.join("\n");
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

let editingId = null;
let cachedRows = [];
let userCurrency = "BRL";

async function loadCurrency(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("currency")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  userCurrency = data?.currency || "BRL";
}

async function fetchRows(userId, year) {
  const { data, error } = await supabase
    .from("ir_deductions")
    .select("id, year, deduction_type, description, beneficiary, document, amount, created_at")
    .eq("user_id", userId)
    .eq("year", year)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

async function insertRow(userId, payload) {
  const { error } = await supabase.from("ir_deductions").insert({
    user_id: userId,
    ...payload
  });
  if (error) throw error;
}

async function updateRow(id, payload) {
  const { error } = await supabase.from("ir_deductions").update(payload).eq("id", id);
  if (error) throw error;
}

async function deleteRow(id) {
  const { error } = await supabase.from("ir_deductions").delete().eq("id", id);
  if (error) throw error;
}

function renderKPIs(rows) {
  const total = rows.reduce((acc, r) => acc + (Number(r.amount) || 0), 0);
  $("#kpiTotal").textContent = money(total, userCurrency);
  $("#kpiCount").textContent = String(rows.length);
}

function renderList(rows) {
  const wrap = $("#irList");
  if (!wrap) return;

  if (!rows.length) {
    wrap.innerHTML = `<p class="muted">Nenhum pagamento dedutível lançado para este ano.</p>`;
    return;
  }

  wrap.innerHTML = rows.map(r => `
    <div class="ir-item">
      <div class="ir-main">
        <div class="ir-title">
          <span class="badge">${escapeHtml(r.deduction_type)}</span>
          <strong>${escapeHtml(r.description)}</strong>
        </div>
        <div class="ir-sub muted">
          <span>Beneficiário: ${escapeHtml(r.beneficiary || "—")}</span>
          <span>CPF/CNPJ: ${escapeHtml(r.document || "—")}</span>
        </div>
      </div>

      <div class="ir-right">
        <div class="ir-amount">${money(r.amount, userCurrency)}</div>
        <div class="ir-actions">
          <button class="btn" type="button" data-edit="${r.id}">Editar</button>
          <button class="btn danger" type="button" data-del="${r.id}">Excluir</button>
        </div>
      </div>
    </div>
  `).join("");
}

function fillForm(row) {
  $("#deductionType").value = row.deduction_type || "";
  $("#description").value = row.description || "";
  $("#beneficiary").value = row.beneficiary || "";
  $("#document").value = row.document || "";
  $("#amount").value = row.amount ?? "";
  $("#saveBtn").textContent = "Atualizar";
  $("#cancelEditBtn").style.display = "inline-flex";
}

function clearForm() {
  editingId = null;
  $("#irForm").reset();
  $("#saveBtn").textContent = "Salvar";
  $("#cancelEditBtn").style.display = "none";
}

function applyFilter() {
  const q = ($("#filterText").value || "").trim().toLowerCase();
  const filtered = !q ? cachedRows : cachedRows.filter(r => {
    const blob = `${r.deduction_type} ${r.description} ${r.beneficiary || ""} ${r.document || ""}`.toLowerCase();
    return blob.includes(q);
  });

  renderKPIs(filtered);
  renderList(filtered);
}

export async function initIRPage() {
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return;

  await loadCurrency(user.id);

  // anos: atual e 4 anteriores (simples)
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  const yearSelect = $("#irYear");
  yearSelect.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join("");
  yearSelect.value = String(currentYear);

  async function refresh() {
    const year = Number(yearSelect.value);
    cachedRows = await fetchRows(user.id, year);
    clearForm();
    $("#filterText").value = "";
    renderKPIs(cachedRows);
    renderList(cachedRows);
    setStatus("Salvo", "ok");
  }

  // salvar / atualizar
  $("#irForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      setStatus("Salvando…", "warn");

      const payload = {
        year: Number(yearSelect.value),
        deduction_type: $("#deductionType").value,
        description: $("#description").value.trim(),
        beneficiary: ($("#beneficiary").value || "").trim() || null,
        document: ($("#document").value || "").trim() || null,
        amount: Number($("#amount").value),
      };

      if (!payload.deduction_type || !payload.description || !payload.amount) {
        setStatus("Preencha os campos obrigatórios", "err");
        return;
      }

      if (editingId) {
        await updateRow(editingId, payload);
      } else {
        await insertRow(user.id, payload);
      }

      await refresh();
      setStatus("Salvo", "ok");
    } catch (err) {
      console.error(err);
      setStatus("Erro ao salvar", "err");
      alert(err?.message || "Erro ao salvar.");
    }
  });

  // cancelar edição
  $("#cancelEditBtn").addEventListener("click", () => {
    clearForm();
  });

  // trocar ano
  yearSelect.addEventListener("change", refresh);

  // filtro
  $("#filterText").addEventListener("input", applyFilter);

  // editar/excluir
  $("#irList").addEventListener("click", async (e) => {
    const editBtn = e.target.closest("[data-edit]");
    const delBtn = e.target.closest("[data-del]");

    try {
      if (editBtn) {
        const id = editBtn.dataset.edit;
        const row = cachedRows.find(r => r.id === id);
        if (!row) return;
        editingId = id;
        fillForm(row);
      }

      if (delBtn) {
        const id = delBtn.dataset.del;
        if (!confirm("Excluir este lançamento dedutível?")) return;
        setStatus("Excluindo…", "warn");
        await deleteRow(id);
        await refresh();
        setStatus("Salvo", "ok");
      }
    } catch (err) {
      console.error(err);
      setStatus("Erro", "err");
      alert(err?.message || "Erro.");
    }
  });

  // export CSV
  $("#exportCsvBtn").addEventListener("click", () => {
    const year = yearSelect.value;
    const csv = toCsv(cachedRows);
    downloadText(`ir-dedutiveis-${year}.csv`, csv);
  });

  await refresh();
}
