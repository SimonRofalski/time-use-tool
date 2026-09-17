import { CATEGORY_COLORS } from "@/app/[locale]/(protected)/zeiterfassung/types";
import { satisfactionLevelForLabel } from "./satisfaction";
import type {
  CategoryComparison,
  CategoryRow,
  ComparisonMetaStats,
  ComparisonTopic,
  DayBarData,
  MetaAggregates,
} from "./types";

// ─── Persönliche Auswertung als PDF ───────────────────────────────────────────
// Rendered entirely client-side from the data the user already sees on the
// Statistiken page. It contains only the user's own values plus anonymous
// course averages (mean over >= 3 participants) — never other people's data.
//
// Charts are drawn with jsPDF primitives (no screenshots) so they print crisp
// and match the on-screen charts: daily stacked bars, category comparison
// bars, distribution strips for Schlaf / Sport / Smartphone.

export type PersonalReportInput = {
  courseName: string;
  participantName: string;
  participantId: string;
  filterLabel: string;
  barData: DayBarData[];
  categoryRows: CategoryRow[];
  metaAggregates: MetaAggregates | null;
  comparison: {
    enabled: boolean;
    qualifyingUserCount: number;
    topics: ComparisonTopic[];
    metaStats: ComparisonMetaStats | null;
    categories: CategoryComparison[];
  };
};

// ─── Layout constants (mm, A4 portrait) ───────────────────────────────────────

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 14;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_Y = PAGE_H - 10;
const MAX_Y = PAGE_H - 18;

const INK = [30, 41, 59] as const; // slate-800
const MUTED = [100, 116, 139] as const; // slate-500
const LIGHT = [226, 232, 240] as const; // slate-200
const FAINT = [241, 245, 249] as const; // slate-100
const BLUE = [37, 99, 235] as const; // blue-600
const COURSE_GREY = [148, 163, 184] as const; // slate-400
const UNSUBMITTED = [203, 213, 225] as const; // slate-300

// ─── Small helpers ────────────────────────────────────────────────────────────

type Rgb = readonly [number, number, number];

function hexToRgb(hex: string): Rgb {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return [99, 102, 241];
  return [
    Number.parseInt(clean.slice(0, 2), 16),
    Number.parseInt(clean.slice(2, 4), 16),
    Number.parseInt(clean.slice(4, 6), 16),
  ];
}

function categoryColor(categoryId: number): Rgb {
  if (categoryId <= 0) return [148, 163, 184];
  return hexToRgb(CATEGORY_COLORS[(categoryId - 1) % CATEGORY_COLORS.length]);
}

function hours1(minutes: number): string {
  return (minutes / 60).toFixed(1);
}

function formatHm(minutes: number): string {
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

function formatDateShort(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const weekday = date.toLocaleDateString("de-DE", { weekday: "short" });
  return `${weekday.replace(".", "")} ${d}.${m}.`;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

// 0–100: share of course values strictly below the user's value
function percentile(values: number[], userValue: number): number {
  if (values.length === 0) return 0;
  const below = values.filter((v) => v < userValue).length;
  return Math.round((below / values.length) * 100);
}

function positionText(values: number[], userValue: number): string {
  if (userValue === 0) return "Keine eigenen Einträge in diesem Zeitraum";
  const p = percentile(values, userValue);
  return p >= 50
    ? `Du liegst über ${p}% der Kursgruppe`
    : `Du liegst unter ${100 - p}% der Kursgruppe`;
}

function differenceText(userValue: number, meanValue: number): string {
  const diff = userValue - meanValue;
  if (Math.abs(diff) < 0.25) return "im Kursschnitt";
  return `${diff > 0 ? "+" : "-"}${Math.abs(diff).toFixed(1)} h/Tag`;
}

// Word for an average label ("4.1 / 5 (82%)") — same five levels as the Zeiterfassung
function satisfactionWord(label: string): string {
  return satisfactionLevelForLabel(label)?.label ?? "";
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function generatePersonalReportPdf(
  input: PersonalReportInput,
): Promise<void> {
  const { doc, fileName } = await buildPersonalReportPdf(input);
  doc.save(fileName);
}

// Builds the document without saving — used by the export above and testable in Node.
export async function buildPersonalReportPdf(input: PersonalReportInput) {
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = autoTableModule.default;

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const generatedAt = new Date().toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const submittedDays = input.barData.filter((d) => d.isSubmitted).length;
  const totalDays = input.barData.length;
  const totalMinutes = input.categoryRows.reduce(
    (s, r) => s + r.totalMinutes,
    0,
  );
  const hasComparison =
    input.comparison.enabled &&
    input.comparison.qualifyingUserCount >= 3 &&
    input.comparison.topics.length > 0;
  const courseMeanByCategory: Record<number, number> = {};
  const courseValuesByCategory: Record<number, number[]> = {};
  for (const c of input.comparison.categories) {
    courseMeanByCategory[c.categoryId] = mean(c.allValues);
    courseValuesByCategory[c.categoryId] = c.allValues;
  }

  let y = MARGIN;

  // ── Page furniture ──────────────────────────────────────────────────────────

  function setText(size: number, color: Rgb = INK, style: "normal" | "bold" = "normal") {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
  }

  function ensureSpace(needed: number) {
    if (y + needed > MAX_Y) {
      doc.addPage();
      y = MARGIN;
    }
  }

  function sectionTitle(title: string, subtitle?: string) {
    ensureSpace(subtitle ? 14 : 10);
    setText(12, INK, "bold");
    doc.text(title, MARGIN, y);
    y += 5;
    if (subtitle) {
      setText(8, MUTED);
      doc.text(subtitle, MARGIN, y);
      y += 4;
    }
    y += 2;
  }

  function lastTableY(): number {
    return (
      (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable
        ?.finalY ?? y
    );
  }

  function drawFooters() {
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      setText(7.5, MUTED);
      doc.text(
        "Time Use Tool · Persönliche Auswertung · Nur eigene Daten und anonyme Kursdurchschnitte",
        MARGIN,
        FOOTER_Y,
      );
      doc.text(`Seite ${i} / ${pageCount}`, PAGE_W - MARGIN, FOOTER_Y, {
        align: "right",
      });
    }
  }

  // ── Header ──────────────────────────────────────────────────────────────────

  setText(17, INK, "bold");
  doc.text("Persönliche Zeitnutzungs-Auswertung", MARGIN, y + 2);
  y += 9;

  setText(9, MUTED);
  const headerLines = [
    `Kurs: ${input.courseName || "-"}`,
    `Teilnehmer:in: ${input.participantName || "-"}`,
    `Teilnehmer-ID: ${input.participantId}`,
    `Zeitraum: ${input.filterLabel} · Erstellt am ${generatedAt}`,
  ];
  for (const line of headerLines) {
    doc.text(line, MARGIN, y);
    y += 4.2;
  }
  setText(7, MUTED);
  const note = doc.splitTextToSize(
    "Diese Auswertung enthält ausschliesslich deine eigenen Zeitnutzungsdaten. Kurswerte sind Durchschnitte über mindestens drei anonyme Teilnehmende; Einzelwerte anderer Personen sind nicht enthalten. Die Teilnehmer-ID dient dir als Referenz.",
    CONTENT_W,
  );
  doc.text(note, MARGIN, y + 0.5);
  y += note.length * 3.2 + 4;

  // KPI boxes
  const deviceItems = input.metaAggregates?.devices ?? [];
  const deviceTotal = deviceItems.reduce((s, i) => s + i.minutes, 0);
  const withoutDevice =
    deviceItems.find((i) => i.name === "Ohne IT-Gerät")?.minutes ?? 0;
  const withDevicePercent =
    deviceTotal > 0 ? Math.round(((deviceTotal - withoutDevice) / deviceTotal) * 100) : null;
  const wellbeing = input.metaAggregates?.avgSatisfactionLabel ?? "-";

  const kpis: { label: string; value: string; hint: string }[] = [
    {
      label: "Abgegebene Tage",
      value: `${submittedDays} / ${totalDays}`,
      hint: "im gewählten Zeitraum",
    },
    {
      label: "Erfasste Zeit",
      value: `${hours1(totalMinutes)} h`,
      hint:
        submittedDays > 0
          ? `Ø ${hours1(totalMinutes / submittedDays)} h pro Tag`
          : "-",
    },
    {
      label: "Ø Wohlbefinden",
      value: wellbeing.split("(")[0].trim() || "-",
      hint: satisfactionWord(wellbeing) || "zeitgewichtet",
    },
    {
      label: "Zeit mit IT-Gerät",
      value: withDevicePercent != null ? `${withDevicePercent}%` : "-",
      hint: "Anteil der erfassten Zeit",
    },
  ];
  const boxW = (CONTENT_W - 3 * 3) / 4;
  kpis.forEach((kpi, i) => {
    const x = MARGIN + i * (boxW + 3);
    doc.setFillColor(FAINT[0], FAINT[1], FAINT[2]);
    doc.setDrawColor(LIGHT[0], LIGHT[1], LIGHT[2]);
    doc.roundedRect(x, y, boxW, 18, 1.5, 1.5, "FD");
    setText(7, MUTED, "bold");
    doc.text(kpi.label.toUpperCase(), x + 3, y + 5);
    setText(13, INK, "bold");
    doc.text(kpi.value, x + 3, y + 11.5);
    setText(7, MUTED);
    doc.text(kpi.hint, x + 3, y + 15.5);
  });
  y += 24;

  // ── 1. Tägliche Zeitverteilung (stacked bars) ───────────────────────────────

  sectionTitle(
    "Tägliche Zeitverteilung",
    "Stunden pro Kurstag nach Kategorie · grau: Tag nicht abgegeben",
  );

  const categoryNames = input.categoryRows.map((r) => r.name);
  const colorByName: Record<string, Rgb> = {};
  for (const r of input.categoryRows) colorByName[r.name] = categoryColor(r.categoryId);

  const chartH = 50;
  const axisX = MARGIN + 9;
  const chartX = axisX + 1;
  const chartW = CONTENT_W - 10;
  const days = input.barData;

  if (days.length === 0) {
    setText(9, MUTED);
    doc.text("Keine Tage für den gewählten Zeitraum vorhanden.", MARGIN, y + 5);
    y += 12;
  } else {
    ensureSpace(chartH + 26);
    const top = y;
    // Grid + y labels every 6h
    for (let h = 0; h <= 24; h += 6) {
      const gy = top + chartH - (h / 24) * chartH;
      doc.setDrawColor(FAINT[0], FAINT[1], FAINT[2]);
      doc.line(chartX, gy, chartX + chartW, gy);
      setText(7, MUTED);
      doc.text(`${h}h`, axisX - 1, gy + 1, { align: "right" });
    }
    const slot = chartW / days.length;
    const barW = Math.max(1.2, slot * 0.72);
    const labelEvery = Math.max(1, Math.ceil(days.length / 16));
    days.forEach((day, i) => {
      const bx = chartX + i * slot + (slot - barW) / 2;
      let stackY = top + chartH;
      if (!day.isSubmitted) {
        const stub = typeof day.unsubmitted === "number" ? day.unsubmitted : 0;
        if (stub > 0) {
          const h = (stub / 1440) * chartH;
          doc.setFillColor(UNSUBMITTED[0], UNSUBMITTED[1], UNSUBMITTED[2]);
          doc.rect(bx, stackY - h, barW, h, "F");
        }
      } else {
        for (const name of categoryNames) {
          const mins = typeof day[name] === "number" ? (day[name] as number) : 0;
          if (mins <= 0) continue;
          const h = (mins / 1440) * chartH;
          const c = colorByName[name] ?? COURSE_GREY;
          doc.setFillColor(c[0], c[1], c[2]);
          doc.rect(bx, stackY - h, barW, h, "F");
          stackY -= h;
        }
      }
      if (i % labelEvery === 0 || days.length <= 16) {
        setText(6.5, MUTED);
        doc.text(formatDateShort(day.date), bx + barW / 2, top + chartH + 3.5, {
          align: "center",
        });
      }
    });
    y = top + chartH + 7;

    // Legend
    setText(7, MUTED);
    let lx = MARGIN;
    let ly = y;
    for (const name of categoryNames) {
      const w = doc.getTextWidth(name) + 6;
      if (lx + w > MARGIN + CONTENT_W) {
        lx = MARGIN;
        ly += 4;
      }
      const c = colorByName[name] ?? COURSE_GREY;
      doc.setFillColor(c[0], c[1], c[2]);
      doc.rect(lx, ly - 2.2, 2.5, 2.5, "F");
      doc.text(name, lx + 3.5, ly);
      lx += w + 3;
    }
    y = ly + 6;
  }

  // ── 2. Zeitverteilung nach Kategorie (bars + table) ─────────────────────────

  sectionTitle(
    "Zeitverteilung nach Kategorie",
    hasComparison
      ? "Ø Stunden pro abgegebenem Tag · farbig: du · grau: Ø Kurs"
      : "Ø Stunden pro abgegebenem Tag",
  );

  const catRows = [...input.categoryRows]
    .sort((a, b) => b.totalMinutes - a.totalMinutes)
    .map((r) => {
      const userPerDay = submittedDays > 0 ? r.totalMinutes / 60 / submittedDays : 0;
      const courseMean = courseMeanByCategory[r.categoryId];
      return { ...r, userPerDay, courseMean };
    });
  // Categories the course uses but the user doesn't (only with comparison)
  if (hasComparison) {
    for (const c of input.comparison.categories) {
      if (!catRows.some((r) => r.categoryId === c.categoryId)) {
        catRows.push({
          categoryId: c.categoryId,
          name: c.name,
          totalMinutes: 0,
          percentOfTotal: 0,
          isExpanded: false,
          subcategories: [],
          userPerDay: 0,
          courseMean: mean(c.allValues),
        });
      }
    }
  }

  if (catRows.length === 0) {
    setText(9, MUTED);
    doc.text("Noch keine Zeiteinträge vorhanden.", MARGIN, y + 4);
    y += 10;
  } else {
    // One table; the "Vergleich" column gets paired bars drawn into the cell
    // (coloured = you, grey = course mean) so chart and numbers stay together.
    const maxVal = Math.max(
      1,
      ...catRows.flatMap((r) => [r.userPerDay, r.courseMean ?? 0]),
    );
    const BAR_COL = 1;
    const head = hasComparison
      ? [["Kategorie", "Ø h/Tag (du / Kurs)", "Ø / Tag", "Ø Kurs", "Differenz", "Einordnung", "Gesamt", "Anteil"]]
      : [["Kategorie", "Ø h/Tag", "Ø / Tag", "Gesamt", "Anteil"]];
    const body = catRows.map((r) => {
      const cm = r.courseMean ?? 0;
      const values = courseValuesByCategory[r.categoryId] ?? [];
      const pos =
        r.userPerDay > 0 && values.length > 0
          ? `über ${percentile(values, r.userPerDay)}% der Gruppe`
          : "-";
      return hasComparison
        ? [
            r.name,
            "",
            `${r.userPerDay.toFixed(1)} h`,
            `${cm.toFixed(1)} h`,
            differenceText(r.userPerDay, cm),
            pos,
            formatHm(r.totalMinutes),
            `${Math.round(r.percentOfTotal)}%`,
          ]
        : [
            r.name,
            "",
            `${r.userPerDay.toFixed(1)} h`,
            formatHm(r.totalMinutes),
            `${Math.round(r.percentOfTotal)}%`,
          ];
    });
    ensureSpace(24);
    autoTable(doc, {
      startY: y,
      head,
      body,
      styles: { fontSize: 7.5, cellPadding: 1.6, textColor: [30, 41, 59], valign: "middle" },
      headStyles: { fillColor: [71, 85, 105], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: hasComparison
        ? {
            0: { cellWidth: 46 },
            1: { cellWidth: 34 },
            2: { halign: "right", fontStyle: "bold" },
            3: { halign: "right" },
            4: { halign: "right" },
            6: { halign: "right" },
            7: { halign: "right" },
          }
        : {
            0: { cellWidth: 70 },
            1: { cellWidth: 50 },
            2: { halign: "right", fontStyle: "bold" },
            3: { halign: "right" },
            4: { halign: "right" },
          },
      margin: { left: MARGIN, right: MARGIN },
      didDrawCell: (data) => {
        if (data.section !== "body" || data.column.index !== BAR_COL) return;
        const r = catRows[data.row.index];
        if (!r) return;
        const x = data.cell.x + 1.5;
        const w = data.cell.width - 3;
        const c = categoryColor(r.categoryId);
        if (hasComparison) {
          const midY = data.cell.y + data.cell.height / 2;
          doc.setFillColor(FAINT[0], FAINT[1], FAINT[2]);
          doc.rect(x, midY - 2.6, w, 2.2, "F");
          doc.rect(x, midY + 0.4, w, 2.2, "F");
          doc.setFillColor(c[0], c[1], c[2]);
          doc.rect(x, midY - 2.6, (r.userPerDay / maxVal) * w, 2.2, "F");
          doc.setFillColor(COURSE_GREY[0], COURSE_GREY[1], COURSE_GREY[2]);
          doc.rect(x, midY + 0.4, ((r.courseMean ?? 0) / maxVal) * w, 2.2, "F");
        } else {
          const midY = data.cell.y + data.cell.height / 2;
          doc.setFillColor(FAINT[0], FAINT[1], FAINT[2]);
          doc.rect(x, midY - 1.2, w, 2.4, "F");
          doc.setFillColor(c[0], c[1], c[2]);
          doc.rect(x, midY - 1.2, (r.userPerDay / maxVal) * w, 2.4, "F");
        }
      },
    });
    y = lastTableY() + 8;
  }

  // ── 3. Kursvergleich ────────────────────────────────────────────────────────

  // Keep the heading together with the three distribution strips
  ensureSpace(hasComparison ? 82 : 22);
  sectionTitle(
    "Kursvergleich – wo stehst du?",
    hasComparison
      ? `Vergleich mit ${input.comparison.qualifyingUserCount} anonymen Teilnehmenden (je mind. 2 abgegebene Tage) · blau: dein Wert · gestrichelt: Ø Kurs`
      : undefined,
  );

  if (!input.comparison.enabled) {
    setText(9, MUTED);
    doc.text(
      "Der Kursvergleich ist für diesen Kurs (noch) nicht freigeschaltet.",
      MARGIN,
      y + 3,
    );
    y += 10;
  } else if (!hasComparison) {
    setText(9, MUTED);
    doc.text(
      `Noch nicht verfügbar: mindestens 3 Teilnehmende mit je 2 abgegebenen Tagen nötig (aktuell ${input.comparison.qualifyingUserCount}).`,
      MARGIN,
      y + 3,
    );
    y += 10;
  } else {
    // Distribution strips for the three topics
    for (const topic of input.comparison.topics) {
      ensureSpace(22);
      const values = topic.allValues;
      const rawMin = Math.min(...values);
      const rawMax = Math.max(...values);
      const range = rawMax - rawMin || 1;
      const axisMin = Math.max(0, rawMin - range * 0.15);
      const axisMax = rawMax + range * 0.15;
      const toX = (v: number) =>
        MARGIN + Math.max(0.02, Math.min(0.98, (v - axisMin) / (axisMax - axisMin))) * CONTENT_W;
      const meanValue = mean(values);

      setText(9, INK, "bold");
      doc.text(topic.label, MARGIN, y + 3);
      setText(7.5, MUTED);
      doc.text(
        `Dein Wert ${topic.userValue.toFixed(1)} ${topic.unit}   ·   Ø Kurs ${meanValue.toFixed(1)} ${topic.unit}   ·   ${differenceText(topic.userValue, meanValue)}`,
        PAGE_W - MARGIN,
        y + 3,
        { align: "right" },
      );
      const lineY = y + 9.5;
      doc.setDrawColor(LIGHT[0], LIGHT[1], LIGHT[2]);
      doc.setLineWidth(0.6);
      doc.line(MARGIN, lineY, MARGIN + CONTENT_W, lineY);
      doc.setLineWidth(0.2);
      // course mean (dashed)
      const mx = toX(meanValue);
      doc.setDrawColor(COURSE_GREY[0], COURSE_GREY[1], COURSE_GREY[2]);
      doc.setLineDashPattern([1, 1], 0);
      doc.line(mx, lineY - 4, mx, lineY + 4);
      doc.setLineDashPattern([], 0);
      // user dot
      const ux = toX(topic.userValue);
      doc.setFillColor(BLUE[0], BLUE[1], BLUE[2]);
      doc.setDrawColor(255, 255, 255);
      doc.circle(ux, lineY, 1.8, "FD");
      // axis labels + verdict
      setText(6.5, MUTED);
      doc.text(`${axisMin.toFixed(1)} ${topic.unit}`, MARGIN, lineY + 6.5);
      doc.text(`${axisMax.toFixed(1)} ${topic.unit}`, MARGIN + CONTENT_W, lineY + 6.5, {
        align: "right",
      });
      setText(7.5, BLUE, "bold");
      doc.text(positionText(values, topic.userValue), PAGE_W / 2, lineY + 6.5, {
        align: "center",
      });
      y = lineY + 12;
    }

    // Meta comparison table
    const ms = input.comparison.metaStats;
    if (ms) {
      const pair = (p: { leftPercent: number; rightPercent: number } | null) =>
        p ? `${p.leftPercent}% / ${p.rightPercent}%` : "-";
      ensureSpace(34);
      autoTable(doc, {
        startY: y,
        head: [["Merkmal", "Du", "Ø Kurs"]],
        body: [
          ["IT-Gerät (mit / ohne)", pair(ms.itDevice.user), pair(ms.itDevice.course)],
          ["Sozial (mit anderen / allein)", pair(ms.social.user), pair(ms.social.course)],
          ["Ort (zuhause / anderswo)", pair(ms.location.user), pair(ms.location.course)],
          [
            "Wohlbefinden (Ø, zeitgewichtet)",
            `${ms.wellbeing.userLabel} ${satisfactionWord(ms.wellbeing.userLabel)}`.trim(),
            `${ms.wellbeing.courseLabel} ${satisfactionWord(ms.wellbeing.courseLabel)}`.trim(),
          ],
        ],
        styles: { fontSize: 7.5, cellPadding: 1.6, textColor: [30, 41, 59] },
        headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: "bold" },
        columnStyles: { 1: { halign: "right", fontStyle: "bold" }, 2: { halign: "right" } },
        margin: { left: MARGIN, right: MARGIN },
      });
      y = lastTableY() + 8;
    }
  }

  // ── 4. Kontext deiner Zeit (Geräte / Sozial / Orte) ─────────────────────────

  const meta = input.metaAggregates;
  if (meta) {
    sectionTitle(
      "Kontext deiner Zeit",
      "Womit, mit wem und wo du deine erfasste Zeit verbracht hast (Anteil an der Gesamtzeit)",
    );
    const groups: { title: string; items: { name: string; minutes: number }[] }[] = [
      { title: "Geräte-Nutzung", items: meta.devices },
      { title: "Sozialer Kontext", items: meta.social },
      { title: "Orte & Transport", items: meta.locations },
    ];
    const colW = (CONTENT_W - 2 * 4) / 3;
    const maxRows = Math.max(...groups.map((g) => Math.min(g.items.length, 6)), 1);
    ensureSpace(8 + maxRows * 4.4 + 6);
    const top = y;
    groups.forEach((g, gi) => {
      const x = MARGIN + gi * (colW + 4);
      const total = g.items.reduce((s, i) => s + i.minutes, 0);
      setText(7.5, MUTED, "bold");
      doc.text(g.title.toUpperCase(), x, top + 3);
      let gy = top + 8;
      for (const item of g.items.slice(0, 6)) {
        const pct = total > 0 ? Math.round((item.minutes / total) * 100) : 0;
        setText(7.5, INK);
        const name = item.name.length > 22 ? `${item.name.slice(0, 21)}…` : item.name;
        doc.text(name, x, gy);
        setText(7.5, MUTED);
        doc.text(`${hours1(item.minutes)} h · ${pct}%`, x + colW, gy, { align: "right" });
        gy += 4.4;
      }
      if (g.items.length === 0) {
        setText(7.5, MUTED);
        doc.text("-", x, gy);
      }
    });
    y = top + 8 + maxRows * 4.4 + 6;
  }

  // ── 5. Top-Aktivitäten ──────────────────────────────────────────────────────

  const activityRows = input.categoryRows
    .flatMap((cat) =>
      cat.subcategories.flatMap((sub) =>
        sub.activities.map((act) => ({
          category: cat.name,
          name: act.name,
          minutes: act.totalMinutes,
          percent: act.percentOfTotal,
          satisfaction: act.meta?.avgSatisfactionLabel ?? "-",
          devicePercent:
            act.meta && act.meta.withDevicesMinutes + act.meta.withoutDevicesMinutes > 0
              ? Math.round(
                  (act.meta.withDevicesMinutes /
                    (act.meta.withDevicesMinutes + act.meta.withoutDevicesMinutes)) *
                    100,
                )
              : null,
        })),
      ),
    )
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 12);

  if (activityRows.length > 0) {
    sectionTitle(
      "Deine Top-Aktivitäten",
      "Die 12 Tätigkeiten mit der meisten Zeit · Wohlbefinden zeitgewichtet · IT: Anteil der Zeit mit Gerät",
    );
    ensureSpace(20);
    autoTable(doc, {
      startY: y,
      head: [["Kategorie", "Aktivität", "Zeit", "Anteil", "Ø Wohlbefinden", "IT"]],
      body: activityRows.map((r) => [
        r.category,
        r.name,
        formatHm(r.minutes),
        `${Math.round(r.percent)}%`,
        r.satisfaction,
        r.devicePercent != null ? `${r.devicePercent}%` : "-",
      ]),
      styles: { fontSize: 7.5, cellPadding: 1.6, textColor: [30, 41, 59] },
      headStyles: { fillColor: [71, 85, 105], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 44 },
        2: { halign: "right" },
        3: { halign: "right" },
        4: { halign: "right" },
        5: { halign: "right" },
      },
      margin: { left: MARGIN, right: MARGIN },
    });
    y = lastTableY() + 8;
  }

  drawFooters();

  const safeName = (input.participantName || "Auswertung")
    .replace(/[^\w\- äöüÄÖÜß]/g, "")
    .trim()
    .replace(/\s+/g, "_");
  return {
    doc,
    fileName: `Zeitnutzung_${safeName}_${generatedAt.replaceAll(".", "-")}.pdf`,
  };
}
