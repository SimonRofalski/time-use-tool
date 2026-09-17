-- ─── Ethikprüfung: Admins dürfen keine personenbezogenen Zeitnutzungsdaten lesen ──
--
-- Bisher erlaubte die Policy "Admins can read all time_entries" Admins den
-- direkten Lesezugriff auf ALLE Zeiteinträge (inkl. Zuordnung zur Person über
-- day.profiles_id). Damit wäre die UI-Einschränkung allein umgehbar (z. B. über
-- die REST-API mit dem eigenen Admin-Token).
--
-- Neues Modell:
--   • Admin darf weiterhin lesen: profiles (Name/E-Mail), user_course,
--     course/course_period und day (date + is_submitted → true/false).
--   • Admin darf NICHT mehr lesen: time_entry sowie die Junction-Tabellen
--     time_entry_digital_media_type und time_entry_social_context
--     (Ausnahme: die eigenen Einträge, falls der Admin selbst erfasst).
--   • Aggregierte Statistiken und de-identifizierte Exporte für Admins werden
--     ausschliesslich serverseitig über Next.js Route Handler erzeugt
--     (app/api/admin/*, Service-Role-Key, siehe lib/admin/*).
--
-- Umsetzung mit RESTRICTIVE Policies: Diese werden per AND mit allen bestehenden
-- (permissiven) Policies verknüpft. Vorhandene Policies für Teilnehmende – z. B.
-- für den Kursvergleich – bleiben dadurch unverändert und müssen nicht bekannt
-- sein. Ein Admin wird zusätzlich ausgesperrt, alle anderen nicht.

-- time_entry ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins cannot read others time_entries" ON public.time_entry;
CREATE POLICY "Admins cannot read others time_entries"
  ON public.time_entry
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    NOT public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.day
      WHERE day.day_id = time_entry.day_id
        AND day.profiles_id = auth.uid()
    )
  );

-- time_entry_digital_media_type ----------------------------------------------------
ALTER TABLE public.time_entry_digital_media_type ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins cannot read others time_entry_digital_media_type"
  ON public.time_entry_digital_media_type;
CREATE POLICY "Admins cannot read others time_entry_digital_media_type"
  ON public.time_entry_digital_media_type
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    NOT public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.time_entry te
      JOIN public.day d ON d.day_id = te.day_id
      WHERE te.entry_id = time_entry_digital_media_type.entry_id
        AND d.profiles_id = auth.uid()
    )
  );

-- time_entry_social_context --------------------------------------------------------
ALTER TABLE public.time_entry_social_context ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins cannot read others time_entry_social_context"
  ON public.time_entry_social_context;
CREATE POLICY "Admins cannot read others time_entry_social_context"
  ON public.time_entry_social_context
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    NOT public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.time_entry te
      JOIN public.day d ON d.day_id = te.day_id
      WHERE te.entry_id = time_entry_social_context.entry_id
        AND d.profiles_id = auth.uid()
    )
  );

-- Hinweis: Die alte permissive Policy "Admins can read all time_entries" kann
-- bestehen bleiben – die RESTRICTIVE Policy oben hebt den Admin-Zugriff auf.
-- Optional zum Aufräumen (nur wenn die Teilnehmenden-Policies separat existieren):
--   DROP POLICY IF EXISTS "Admins can read all time_entries" ON public.time_entry;
--   CREATE POLICY "Users can read own time_entries" ON public.time_entry
--     FOR SELECT TO authenticated
--     USING (EXISTS (SELECT 1 FROM public.day
--                    WHERE day.day_id = time_entry.day_id
--                      AND day.profiles_id = auth.uid()));
