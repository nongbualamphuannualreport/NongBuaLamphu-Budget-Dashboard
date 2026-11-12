import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function isConfigured() {
  return Boolean(url && anon && service && !url.includes("YOUR_PROJECT"));
}

export function publicDb() {
  if (!url || !anon) throw new Error("Missing public database settings");
  return createClient(url, anon, { auth: { persistSession: false } });
}

export function serverDb() {
  if (!url || !service) throw new Error("Missing server database settings");
  return createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function verifyAdmin(authorization: string | null) {
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice(7).trim();
  if (!token || !url || !anon || !service) return null;
  const authClient = createClient(url, anon, { auth: { persistSession: false } });
  const { data: userData, error } = await authClient.auth.getUser(token);
  if (error || !userData.user) return null;
  const db = serverDb();
  const { data: admin, error: adminError } = await db.from("admin_users")
    .select("user_id").eq("user_id", userData.user.id).maybeSingle();
  if (adminError || !admin) return null;
  return userData.user;
}
