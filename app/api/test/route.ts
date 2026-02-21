import { createSupabaseServerClient } from "@/lib/supabase/server-client";
import { SupabaseClient } from "@supabase/supabase-js";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("profiles").select("*");

  if (error) {
    console.error("SUPABASE connection failed:", error.message);
    return new Response(
      JSON.stringify({ connected: false, error: error.message }),
      { status: 500 },
    );
  }

  console.log("Supabase connected successfully!");

  return new Response("Testausgabe: API funktioniert einwandfrei!", {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}
