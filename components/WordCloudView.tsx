"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import cloud from "d3-cloud";
import type { CloudWord } from "@/lib/text";
import { Legend } from "./Stat";

type Placed = CloudWord & {
  x: number;
  y: number;
  size: number;
  rotate: number;
};

/**
 * Words sized by frequency within their sentiment bucket. Positive and negative
 * clouds are kept separate on purpose — the contrast between praise language
 * and complaint language is the whole point.
 */
export function WordCloudView({
  words,
  tone,
}: {
  words: CloudWord[];
  tone: "positive" | "negative";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(560);
  const [placed, setPlaced] = useState<Placed[] | null>(null);
  const height = 260;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setWidth(Math.max(280, Math.floor(entry.contentRect.width)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scaled = useMemo(() => {
    if (words.length === 0) return [];
    const max = Math.max(...words.map((w) => w.value));
    const min = Math.min(...words.map((w) => w.value));
    const span = Math.max(1, max - min);
    return words.map((w) => ({
      ...w,
      size: 12 + ((w.value - min) / span) * 34,
    }));
  }, [words]);

  useEffect(() => {
    if (scaled.length === 0) return;
    let cancelled = false;
    const layout = cloud<Placed>()
      .size([width, height])
      .words(scaled.map((w) => ({ ...w, x: 0, y: 0, rotate: 0 })) as Placed[])
      .padding(3)
      .rotate(0)
      .font("var(--font-jakarta), Plus Jakarta Sans, sans-serif")
      .fontSize((d) => (d as Placed).size)
      .on("end", (out) => {
        if (!cancelled) setPlaced(out as Placed[]);
      });
    layout.start();
    return () => {
      cancelled = true;
      layout.stop();
    };
  }, [scaled, width]);

  const colour = (v: number, max: number) => {
    const t = v / max;
    if (tone === "positive") {
      return t > 0.6 ? "#00a5af" : t > 0.3 ? "#4dc0c7" : "#99dbdf";
    }
    return t > 0.6 ? "#d85827" : t > 0.3 ? "#e08159" : "#eeb69c";
  };
  const max = Math.max(1, ...words.map((w) => w.value));

  const top = words.slice().sort((a, b) => b.value - a.value)[0];
  const ramp =
    tone === "positive"
      ? ["#99dbdf", "#4dc0c7", "#00a5af"]
      : ["#eeb69c", "#e08159", "#d85827"];

  return (
    <div ref={ref} className="w-full">
      {words.length === 0 ? (
        <div
          style={{ height }}
          className="flex items-center justify-center rounded-lg border border-dashed border-line text-[13px] text-ink-40"
        >
          No word or phrase came up often enough to plot.
        </div>
      ) : placed === null ? (
        <div style={{ height }} className="animate-pulse rounded-lg bg-canvas" />
      ) : (
        <svg width={width} height={height} role="img" aria-label={`${tone} word cloud`}>
          <g transform={`translate(${width / 2},${height / 2})`}>
            {placed.map((w) => (
              <text
                key={w.text}
                textAnchor="middle"
                transform={`translate(${w.x},${w.y}) rotate(${w.rotate})`}
                style={{
                  fontSize: w.size,
                  fontWeight: w.value > max * 0.5 ? 700 : 500,
                  fill: colour(w.value, max),
                  fontFamily: "var(--font-jakarta), Plus Jakarta Sans, sans-serif",
                }}
              >
                {w.text}
              </text>
            ))}
          </g>
        </svg>
      )}

      {words.length > 0 ? (
        <Legend
          className="mt-3 border-t border-line pt-3"
          items={[
            { colour: null, label: "Bigger word = more reviews used it" },
            { colour: ramp[0], label: "Used less often" },
            { colour: ramp[1], label: "Used more" },
            { colour: ramp[2], label: "Used most" },
          ]}
          note={
            top
              ? `Most repeated here: "${top.text}", in ${top.value} of these reviews. Product names and the category itself are filtered out, so "air fryer" cannot crowd out what people actually said about it.`
              : undefined
          }
        />
      ) : null}
    </div>
  );
}
