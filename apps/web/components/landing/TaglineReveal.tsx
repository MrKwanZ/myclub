"use client";

import { useEffect, useRef, useState } from "react";

type TaglineRevealProps = {
  lines: string[];
};

export function TaglineReveal({ lines }: TaglineRevealProps) {
  const words = lines.map((line) => line.split(" "));
  const total = words.reduce((sum, line) => sum + line.length, 0);
  const refs = useRef<Array<HTMLSpanElement | null>>([]);
  const [count, setCount] = useState(0);
  const countRef = useRef(0);
  const targetRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      countRef.current = total;
      setCount(total);
      return;
    }

    const pump = () => {
      if (countRef.current >= targetRef.current) {
        timerRef.current = null;
        return;
      }
      countRef.current += 1;
      setCount(countRef.current);
      timerRef.current = window.setTimeout(pump, 60);
    };

    const measure = () => {
      const trigger = window.innerHeight * 0.72;
      let next = 0;
      refs.current.forEach((node, index) => {
        if (!node) return;
        if (node.getBoundingClientRect().top < trigger - index * 4) next = index + 1;
      });
      if (next > targetRef.current) targetRef.current = next;
      if (timerRef.current == null && countRef.current < targetRef.current) pump();
    };

    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, [total]);

  let index = 0;

  return (
    <h2 id="tagline" className="heading-2 lp-tagline">
      {words.map((line) => (
        <span className="lp-tagline-line" key={line.join(" ")}>
          {line.map((word, wordIndex) => {
            const flatIndex = index;
            index += 1;
            return (
              <span key={`${word}-${wordIndex}`}>
                <span
                  ref={(node) => {
                    refs.current[flatIndex] = node;
                  }}
                  className={flatIndex < count ? "lp-word is-on" : "lp-word"}
                >
                  {word}
                </span>
                {wordIndex < line.length - 1 ? " " : null}
              </span>
            );
          })}
        </span>
      ))}
    </h2>
  );
}
