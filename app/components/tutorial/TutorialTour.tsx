"use client";

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

// Scripted example state the Zeiterfassung page shows while a step is active
// (never saved): an empty day, then a night 00:00–06:00 walked through the
// questionnaire step by step
export type TutorialDemo =
  | "empty"
  | "select-night"
  | "primary-chosen"
  | "device"
  | "location"
  | "social";

// Window event fired whenever the active step's demo changes (null = none,
// also fired when the tour closes). Pages listen for it instead of the tour
// reaching into their state.
export const TUTORIAL_DEMO_EVENT = "tutorial:demo";
export type TutorialDemoEventDetail = { demo: TutorialDemo | null };

// Last dispatched demo, for pages that mount after the event already fired
// (e.g. navigating back to /zeiterfassung mid-tour)
let currentDemo: TutorialDemo | null = null;
export function getCurrentTutorialDemo(): TutorialDemo | null {
  return currentDemo;
}

export type TutorialStep = {
  // Value of the target element's `data-tour` attribute; omit for a centered step
  target?: string;
  // Alternative to `target`: any CSS selector — the spotlight covers the union
  // of all matches (e.g. the selected cells of the time grid)
  selector?: string;
  // Preferred side for the card on desktop (falls back if it doesn't fit)
  placement?: Placement;
  // "Weiter" first plays a short tap highlight on the target, as if the user
  // had clicked it, before moving on
  tapOnNext?: boolean;
  title: string;
  body: string;
  demo?: TutorialDemo;
  // Page the step belongs to — the host navigates there when the step opens
  route?: string;
  // Host opens its settings panel for this step
  openSettings?: boolean;
  // "none" keeps the page fully visible (only the target gets a ring), used
  // when the step is about the page as a whole
  backdrop?: "dim" | "none";
};

function dispatchDemo(demo: TutorialDemo | null) {
  currentDemo = demo;
  window.dispatchEvent(
    new CustomEvent<TutorialDemoEventDetail>(TUTORIAL_DEMO_EVENT, {
      detail: { demo },
    }),
  );
}

export type TutorialFinishReason = "completed" | "skipped";

type Box = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

type ArrowLine = { x1: number; y1: number; x2: number; y2: number };

type Placement = "bottom" | "top" | "right" | "left";

// ─── Layout constants ─────────────────────────────────────────────────────────

const SPOTLIGHT_PADDING = 6;
// Space between card and target — room for the arrow to curve through
const ARROW_GAP = 64;
const VIEWPORT_MARGIN = 16;
// Below this width the card docks to the top/bottom screen edge instead
const MOBILE_MAX_WIDTH = 640;
// Targets can mount late (e.g. the dynamically imported TimeGrid, or right
// after navigating to /zeiterfassung), so keep looking for a while
const TARGET_LOOKUP_TIMEOUT_MS = 4000;
// Mobile: page targets are scrolled to just below the sticky header + tab bar,
// leaving the lower part of the screen for the docked card
const MOBILE_TARGET_TOP = 132;
// Shorter card–target gap on small screens
const MOBILE_ARROW_GAP = 44;
const TAP_DURATION_MS = 450;

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function toBox(top: number, left: number, width: number, height: number): Box {
  return { top, left, width, height, right: left + width, bottom: top + height };
}

// Clamps into [min, max], or returns the midpoint when the range is inverted
// (target narrower than the insets, e.g. the round settings button)
function clampInto(value: number, min: number, max: number): number {
  if (min > max) return (min + max) / 2;
  return Math.min(Math.max(value, min), max);
}

// Target rect + padding, clipped to the viewport (the time grid can be taller
// than the screen)
function getSpotlightBox(rect: DOMRect, vw: number, vh: number): Box {
  const top = Math.max(rect.top - SPOTLIGHT_PADDING, 4);
  const left = Math.max(rect.left - SPOTLIGHT_PADDING, 4);
  const bottom = Math.min(rect.bottom + SPOTLIGHT_PADDING, vh - 4);
  const right = Math.min(rect.right + SPOTLIGHT_PADDING, vw - 4);
  return toBox(top, left, Math.max(right - left, 0), Math.max(bottom - top, 0));
}

// Union of the elements' rects (for multi-element targets like grid cells)
function getUnionRect(elements: HTMLElement[]): DOMRect | null {
  const rects = elements
    .map((element) => element.getBoundingClientRect())
    .filter((rect) => rect.width > 0 || rect.height > 0);
  if (rects.length === 0) return null;
  const top = Math.min(...rects.map((r) => r.top));
  const left = Math.min(...rects.map((r) => r.left));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  const right = Math.max(...rects.map((r) => r.right));
  return new DOMRect(left, top, right - left, bottom - top);
}

// Picks the card position: the preferred side, then below, above, right or
// left of the target — whichever fits first. Mobile: below the target or centered.
function placeCard(
  target: Box | null,
  cardWidth: number,
  cardHeight: number,
  vw: number,
  vh: number,
  preferred?: Placement,
): { top: number; left: number } {
  const maxLeft = vw - cardWidth - VIEWPORT_MARGIN;
  const maxTop = vh - cardHeight - VIEWPORT_MARGIN;

  if (!target) {
    return { top: (vh - cardHeight) / 2, left: (vw - cardWidth) / 2 };
  }

  // Mobile: right below the target when there's room (targets are scrolled up
  // to just under the header), otherwise vertically centered
  if (vw < MOBILE_MAX_WIDTH) {
    const left = (vw - cardWidth) / 2;
    const below = target.bottom + MOBILE_ARROW_GAP;
    if (below + cardHeight <= vh - VIEWPORT_MARGIN) {
      return { left, top: below };
    }
    return { left, top: Math.max((vh - cardHeight) / 2, VIEWPORT_MARGIN) };
  }

  const centeredLeft = clampInto(
    target.left + target.width / 2 - cardWidth / 2,
    VIEWPORT_MARGIN,
    maxLeft,
  );
  const centeredTop = clampInto(
    target.top + target.height / 2 - cardHeight / 2,
    VIEWPORT_MARGIN,
    maxTop,
  );

  const candidates: { side: Placement; top: number; left: number; fits: boolean }[] = [
    {
      side: "bottom",
      top: target.bottom + ARROW_GAP,
      left: centeredLeft,
      fits: target.bottom + ARROW_GAP + cardHeight <= vh - VIEWPORT_MARGIN,
    },
    {
      side: "top",
      top: target.top - ARROW_GAP - cardHeight,
      left: centeredLeft,
      fits: target.top - ARROW_GAP - cardHeight >= VIEWPORT_MARGIN,
    },
    {
      side: "right",
      top: centeredTop,
      left: target.right + ARROW_GAP,
      fits: target.right + ARROW_GAP + cardWidth <= vw - VIEWPORT_MARGIN,
    },
    {
      side: "left",
      top: centeredTop,
      left: target.left - ARROW_GAP - cardWidth,
      fits: target.left - ARROW_GAP - cardWidth >= VIEWPORT_MARGIN,
    },
  ];

  const fitting =
    candidates.find((c) => c.side === preferred && c.fits) ??
    candidates.find((c) => c.fits);
  return fitting
    ? { top: fitting.top, left: fitting.left }
    : { top: maxTop, left: centeredLeft };
}

// Start (card edge) and end (target edge) of the arrow. Handles the mobile
// case where the docked card overlaps a tall target by pointing at the part
// of the target that is still visible.
function computeArrow(card: Box, target: Box): ArrowLine | null {
  const EDGE = 8;
  const INSET = 24;
  const targetCenterX = target.left + target.width / 2;
  const targetCenterY = target.top + target.height / 2;

  // Target left of the card
  if (target.right <= card.left - 16) {
    const y1 = clampInto(targetCenterY, card.top + INSET, card.bottom - INSET);
    return {
      x1: card.left - EDGE,
      y1,
      x2: target.right + EDGE,
      y2: clampInto(y1, target.top + 12, target.bottom - 12),
    };
  }

  // Target right of the card
  if (target.left >= card.right + 16) {
    const y1 = clampInto(targetCenterY, card.top + INSET, card.bottom - INSET);
    return {
      x1: card.right + EDGE,
      y1,
      x2: target.left - EDGE,
      y2: clampInto(y1, target.top + 12, target.bottom - 12),
    };
  }

  // Target (at least partly) above the card
  if (target.top + 40 <= card.top) {
    const x1 = clampInto(targetCenterX, card.left + INSET, card.right - INSET);
    const y1 = card.top - EDGE;
    const y2 =
      target.bottom + EDGE <= y1 - 24
        ? target.bottom + EDGE
        : Math.max(target.top + 20, y1 - 110);
    return {
      x1,
      y1,
      x2: clampInto(x1, target.left + 12, target.right - 12),
      y2,
    };
  }

  // Target (at least partly) below the card
  if (target.bottom - 40 >= card.bottom) {
    const x1 = clampInto(targetCenterX, card.left + INSET, card.right - INSET);
    const y1 = card.bottom + EDGE;
    const y2 =
      target.top - EDGE >= y1 + 24
        ? target.top - EDGE
        : Math.min(target.bottom - 20, y1 + 110);
    return {
      x1,
      y1,
      x2: clampInto(x1, target.left + 12, target.right - 12),
      y2,
    };
  }

  return null;
}

// ─── Arrow ────────────────────────────────────────────────────────────────────

// Softly curved blue arrow that draws itself in, then nudges toward the target
function TourArrow({ line }: { line: ArrowLine }) {
  const { x1, y1, x2, y2 } = line;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  if (length < 20) return null;

  // Quadratic curve: control point pushed sideways from the midpoint
  const bend = Math.min(length * 0.25, 40);
  const controlX = (x1 + x2) / 2 + (-dy / length) * bend;
  const controlY = (y1 + y2) / 2 + (dx / length) * bend;

  // Arrowhead follows the curve's tangent at the end point
  const angle = Math.atan2(y2 - controlY, x2 - controlX);
  const headLength = 11;
  const headSpread = 0.5;
  const head1X = x2 - headLength * Math.cos(angle - headSpread);
  const head1Y = y2 - headLength * Math.sin(angle - headSpread);
  const head2X = x2 - headLength * Math.cos(angle + headSpread);
  const head2Y = y2 - headLength * Math.sin(angle + headSpread);

  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible text-blue-500 dark:text-blue-400"
      style={{ filter: "drop-shadow(0 1px 2px rgb(2 6 23 / 0.35))" }}
    >
      <g
        className="tour-arrow-nudge"
        style={
          {
            "--tour-nudge-x": `${Math.cos(angle) * 4}px`,
            "--tour-nudge-y": `${Math.sin(angle) * 4}px`,
          } as CSSProperties
        }
      >
        <path
          className="tour-arrow-path"
          d={`M ${x1} ${y1} Q ${controlX} ${controlY} ${x2} ${y2}`}
          pathLength={1}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
        />
        <path
          className="tour-arrow-head"
          d={`M ${head1X} ${head1Y} L ${x2} ${y2} L ${head2X} ${head2Y}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TutorialTour({
  steps,
  onFinish,
  onStepChange,
}: {
  steps: TutorialStep[];
  onFinish: (reason: TutorialFinishReason) => void;
  // Lets the host navigate / open panels for a step (see `route`, `openSettings`)
  onStepChange?: (step: TutorialStep) => void;
}) {
  const t = useTranslations("tutorial");
  const [index, setIndex] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [targetBox, setTargetBox] = useState<Box | null>(null);
  const [cardSize, setCardSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [tapping, setTapping] = useState(false);
  const targetRef = useRef<HTMLElement[]>([]);
  const tapTimeoutRef = useRef<number | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const nextButtonRef = useRef<HTMLButtonElement | null>(null);

  const step = steps[index];
  const isLast = index === steps.length - 1;
  const dimBackdrop = step.backdrop !== "none";
  const targetSelector =
    step.selector ?? (step.target ? `[data-tour="${step.target}"]` : null);

  // Latest callback + steps in refs, so the step effect fires only on actual
  // step changes (the host rebuilds `steps` on every render)
  const onStepChangeRef = useRef(onStepChange);
  onStepChangeRef.current = onStepChange;
  const stepsRef = useRef(steps);
  stepsRef.current = steps;

  const measure = useCallback(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setViewport({ width: vw, height: vh });
    const rect = getUnionRect(targetRef.current);
    setTargetBox(rect ? getSpotlightBox(rect, vw, vh) : null);
  }, []);

  const advance = useCallback(() => {
    if (index >= steps.length - 1) {
      onFinish("completed");
      return;
    }
    setIndex(index + 1);
  }, [index, steps.length, onFinish]);

  const goNext = useCallback(() => {
    if (tapping) return;
    if (step.tapOnNext && targetBox) {
      setTapping(true);
      tapTimeoutRef.current = window.setTimeout(() => {
        setTapping(false);
        advance();
      }, TAP_DURATION_MS);
      return;
    }
    advance();
  }, [tapping, step.tapOnNext, targetBox, advance]);

  const goBack = useCallback(() => {
    if (tapping) return;
    setIndex((current) => Math.max(current - 1, 0));
  }, [tapping]);

  useEffect(() => {
    setMounted(true);
    return () => {
      if (tapTimeoutRef.current) window.clearTimeout(tapTimeoutRef.current);
      // Tour closed (finished, skipped or unmounted): let pages drop their demo
      dispatchDemo(null);
    };
  }, []);

  useEffect(() => {
    dispatchDemo(step.demo ?? null);
  }, [step.demo]);

  useEffect(() => {
    onStepChangeRef.current?.(stepsRef.current[index]);
  }, [index]);

  // Find the step's target, bring it into view, and keep tracking its size
  useEffect(() => {
    targetRef.current = [];
    measure();
    if (!targetSelector) return;

    const startedAt = performance.now();
    let frame = 0;
    let resizeObserver: ResizeObserver | null = null;

    const find = () => {
      const elements = Array.from(
        document.querySelectorAll<HTMLElement>(targetSelector),
      ).filter((element) => element.getClientRects().length > 0);
      const rect = getUnionRect(elements);
      if (rect) {
        targetRef.current = elements;
        const vh = window.innerHeight;
        const inStickyChrome = !!elements[0].closest("header, nav, aside");
        if (window.innerWidth < MOBILE_MAX_WIDTH) {
          // Mobile: bring the target up top so the card fits below it
          const wellPlaced =
            rect.top >= MOBILE_TARGET_TOP - 20 && rect.top <= vh * 0.4;
          if (!inStickyChrome && !wellPlaced) {
            window.scrollBy({
              top: rect.top - MOBILE_TARGET_TOP,
              behavior: "smooth",
            });
          }
        } else if (rect.top < 0 || rect.bottom > vh) {
          elements[0].scrollIntoView({ block: "center", behavior: "smooth" });
        }
        resizeObserver = new ResizeObserver(measure);
        elements.forEach((element) => resizeObserver?.observe(element));
        measure();
        return;
      }
      if (performance.now() - startedAt < TARGET_LOOKUP_TIMEOUT_MS) {
        frame = requestAnimationFrame(find);
      }
    };
    find();

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
    };
  }, [targetSelector, measure]);

  // Page scroll (incl. the smooth scroll above) and resizes move the target
  useEffect(() => {
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [measure]);

  // The card is re-mounted per step (for its entrance animation), so its size
  // is measured before paint to place it without a visible jump
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const update = () =>
      setCardSize({ width: card.offsetWidth, height: card.offsetHeight });
    update();
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(card);
    return () => resizeObserver.disconnect();
  }, [index, mounted]);

  useEffect(() => {
    nextButtonRef.current?.focus({ preventScroll: true });
  }, [index, mounted]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onFinish("skipped");
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        goBack();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goNext, goBack, onFinish]);

  if (!mounted) return null;

  const vw = viewport.width || window.innerWidth;
  const vh = viewport.height || window.innerHeight;
  const cardPosition = cardSize
    ? placeCard(
        targetBox,
        cardSize.width,
        cardSize.height,
        vw,
        vh,
        step.placement,
      )
    : null;
  const cardBox =
    cardPosition && cardSize
      ? toBox(cardPosition.top, cardPosition.left, cardSize.width, cardSize.height)
      : null;
  const arrow = targetBox && cardBox ? computeArrow(cardBox, targetBox) : null;

  return createPortal(
    <div className="fixed inset-0 z-[60]">
      {/* Click shield: the page stays visible but can't be used mid-tour */}
      <div className="absolute inset-0" aria-hidden />

      {targetBox ? (
        <div
          aria-hidden
          className={`pointer-events-none absolute rounded-xl ring-2 ring-blue-500 transition-all duration-300 ease-out dark:ring-blue-400 ${
            tapping ? "tour-tap" : ""
          }`}
          style={{
            top: targetBox.top,
            left: targetBox.left,
            width: targetBox.width,
            height: targetBox.height,
            boxShadow: dimBackdrop ? "0 0 0 9999px rgb(2 6 23 / 0.55)" : "none",
          }}
        />
      ) : (
        dimBackdrop && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-slate-950/55"
          />
        )
      )}

      {/* Keys are prefixed: arrow and card are siblings, and a shared key made
          React keep stale arrows from earlier steps on screen */}
      {arrow && <TourArrow key={`arrow-${index}`} line={arrow} />}

      <div
        key={`card-${index}`}
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-step-title"
        className="tour-card-in absolute w-[calc(100vw-24px)] rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:w-[min(360px,calc(100vw-32px))] sm:p-4"
        style={
          cardPosition
            ? { top: cardPosition.top, left: cardPosition.left }
            : { top: 0, left: 0, visibility: "hidden" }
        }
      >
        <div className="flex items-center justify-between gap-3">
          <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-blue-700 ring-1 ring-blue-100 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/30">
            {t("stepCounter", { current: index + 1, total: steps.length })}
          </span>
          <button
            type="button"
            aria-label={t("close")}
            onClick={() => onFinish("skipped")}
            className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X size={16} />
          </button>
        </div>

        <h3
          id="tutorial-step-title"
          className="mt-2 text-sm font-bold leading-snug text-slate-900 dark:text-slate-100 sm:mt-3 sm:text-base"
        >
          {step.title}
        </h3>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300 sm:mt-1.5 sm:text-sm">
          {step.body}
        </p>

        <div className="mt-3 flex items-center justify-between gap-3 sm:mt-4">
          <div className="flex items-center gap-1" aria-hidden>
            {steps.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === index
                    ? "w-4 bg-blue-600 dark:bg-blue-400"
                    : i < index
                      ? "w-1.5 bg-blue-300 dark:bg-blue-500/60"
                      : "w-1.5 bg-slate-200 dark:bg-slate-700"
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            {index > 0 && (
              <button
                type="button"
                onClick={goBack}
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {t("back")}
              </button>
            )}
            <button
              ref={nextButtonRef}
              type="button"
              onClick={goNext}
              className="rounded-xl bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              {isLast ? t("finish") : t("next")}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
