import { getTranslations } from "next-intl/server";

export default async function SettingsPage() {
  const t = await getTranslations("settingsPage");

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
        {t("title")}
      </h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        {t("description")}
      </p>
    </div>
  );
}
