import { getTranslations } from "next-intl/server";

export default async function AdminPage() {
  const t = await getTranslations("adminPage");

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
        {t("title")}
      </h1>
    </div>
  );
}
