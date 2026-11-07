-- ─── ICT attention: tutor's final wording (2026-11-06) ──────────────────────
-- The question is now only asked when the entry has a secondary activity and
-- a device was used, and it appears on the device-type screen (app change, no
-- schema change). This only updates the answer texts to the tutor's wording.
-- Codes stay the same: 1 = focused / active use, 2 = background use.

UPDATE public.ict_attention
SET name           = 'Aktive Nutzung',
    name_en        = 'Focused use',
    description    = 'Meine Aufmerksamkeit war auf das Gerät gerichtet (z. B. Surfen im Internet, Nachrichten schreiben, bewusst Videos schauen oder Musik hören).',
    description_en = 'I focused my attention on the device (e.g., browsing, messaging, actively watching videos or listening to music).'
WHERE code = '1';

UPDATE public.ict_attention
SET name           = 'Hintergrundnutzung',
    name_en        = 'Background use',
    description    = 'Das Gerät lief im Hintergrund, während ich mich auf etwas anderes konzentrierte (z. B. Musik oder Videos im Hintergrund).',
    description_en = 'The device ran in the background while I focused on something else (e.g., background music or videos).'
WHERE code = '2';
