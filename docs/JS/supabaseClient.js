import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

export const SUPABASE_URL = "https://evuohaxnzqqmvxmqnkfl.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_PtyiGxLh14m8KQSKtb8XfA_7Q_ynG3F";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
