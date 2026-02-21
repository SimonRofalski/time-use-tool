import { supabase } from "@/lib/supabaseClient";
import { SupabaseClient } from "@supabase/supabase-js";

export async function GET() {
  const { data, error } = await supabase.from("profiles").select("*");

  if (error) {
    console.error("SUPABASE connection failed:", error.message);
    return new Response(
      JSON.stringify({ connected: false, error: error.message }),
      { status: 500 },
    );
  }

  console.log("Supabase connected successfully!+dd");

  return new Response("Testausgabe: API funktioniert!", {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}
