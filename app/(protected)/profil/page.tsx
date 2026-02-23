"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { User } from "@supabase/supabase-js";

export default function ProfilPage() {
  const supabase = getSupabaseBrowserClient();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      },
    );

    return () => {
      listener?.subscription.unsubscribe();
    };
  }, [supabase]);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-white mb-6">Profil</h1>

      {user ? (
        <div className="space-y-4 text-black">
          <div>
            <p className="text-sm text-gray-600">User ID</p>
            <p className="font-mono text-xs text-black">{user.id}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Email</p>
            <p className="text-black">{user.email}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Last sign in</p>
            <p className="text-black">
              {user.last_sign_in_at
                ? new Date(user.last_sign_in_at).toLocaleString()
                : "—"}
            </p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-600">Loading user information...</p>
      )}
    </div>
  );
}
