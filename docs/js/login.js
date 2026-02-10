import { redirectIfAuthed } from "./auth.js";
import { sendPasswordReset, updatePassword } from "./auth.js";
import { supabase } from "./supabaseClient.js";

await redirectIfAuthed();

/* Detecta fluxo de recuperação.
   No Supabase, ao voltar do link, a sessão costuma ser estabelecida automaticamente. */
const { data: sessionData } = await supabase.auth.getSession();
const isRecovery = !!sessionData?.session && /type=recovery/.test(window.location.hash || "");

/* Se isRecovery === true:
   - mostre um form "Nova senha"
   - no submit, chame updatePassword(novaSenha)
*/

/* Enviar recuperação */
document.querySelector("#sendResetBtn")?.addEventListener("click", async () => {
  try {
    const email = document.querySelector("#resetEmail")?.value || "";
    await sendPasswordReset(email);
    alert("Enviamos um link de recuperação para seu e-mail.");
  } catch (e) {
    alert(e?.message || "Erro ao enviar link de recuperação.");
  }
});

/* Redefinir senha (após abrir link) */
document.querySelector("#setNewPasswordBtn")?.addEventListener("click", async () => {
  try {
    const pwd = document.querySelector("#newPassword")?.value || "";
    await updatePassword(pwd);
    alert("Senha atualizada! Faça login novamente.");
    window.location.href = "login.html";
  } catch (e) {
    alert(e?.message || "Erro ao atualizar senha.");
  }
});
