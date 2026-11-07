// "YYYY-MM-DD" in the user's local time zone. Use this for "today" instead of
// toISOString(), which is UTC — between 00:00 and 01:00/02:00 Swiss time that
// would still be yesterday, so pages would disagree on which day is today.
export function getLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
