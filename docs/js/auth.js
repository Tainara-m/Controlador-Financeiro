import { supabase } from "./supabaseClient.js";

/** Redireciona se não estiver logado */
export async function requireAuth() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;

  if (!data.session) {
    window.location.href = "login.html";
    return null;
  }
  return data.session.user;
}

/** Redireciona para home se já estiver logado */
export async function redirectIfAuthed() {
  const { data } = await supabase.auth.getSession();
  if (data?.session) window.location.href = "index.html";
}

/** Login */
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

/** Cadastro */
export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data.user;
}

/** Logout */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
