"use client";

import {
  Calendar,
  ChartColumn,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  Medal,
  Persons,
  Wallet,
} from "@gravity-ui/icons";
import { Icon } from "@gravity-ui/uikit";
import { Accordion, Button } from "@heroui/react";
import { animate } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { TaglineReveal } from "./TaglineReveal";

const navLinks = [
  { id: "steps", href: "#steps", label: "How it works" },
  { id: "benefits", href: "#benefits", label: "Benefits" },
  { id: "features", href: "#features", label: "Features" },
  { id: "faq", href: "#faq", label: "FAQ" },
] as const;

const benefits = [
  {
    title: "Know who is coming",
    copy: "Collect player replies for training and match days in one shared view.",
    icon: Persons,
  },
  {
    title: "Keep every fixture visible",
    copy: "Plan the club calendar without searching through messages.",
    icon: Calendar,
  },
  {
    title: "See the club’s numbers",
    copy: "Attendance, wins and losses, and balance come from the records you already keep.",
    icon: ChartColumn,
  },
  {
    title: "Give players a simple response path",
    copy: "Player logins make attendance updates easy from mobile or browser.",
    icon: CircleCheck,
  },
] as const;

const steps = [
  {
    title: "Create your club",
    copy: "Set up the club within few steps.",
  },
  {
    title: "Add your roster",
    copy: "Add players and create a login, or link an email that already has an account.",
  },
  {
    title: "Plan and track",
    copy: "Publish sessions and fixtures, collect replies, and view club progress.",
  },
] as const;

const areas = [
  {
    title: "Roster",
    copy: "Add players, then create a login or link an email that already has an account.",
    icon: Persons,
  },
  {
    title: "Calendar",
    copy: "Put training and matches on one month, with a place and a start time.",
    icon: Calendar,
  },
  {
    title: "Attendance",
    copy: "Players reply for each session. Late counts as attended in the recent rate.",
    icon: CircleCheck,
  },
  {
    title: "Matches",
    copy: "Record the opponent and the result. Wins, losses, and draws feed the club record.",
    icon: Medal,
  },
  {
    title: "Finance",
    copy: "Enter income and expenses. The balance is income minus expenses.",
    icon: Wallet,
  },
] as const;

const faqs = [
  {
    question: "Who is MyClub for?",
    answer:
      "Club managers who run sessions, matches, and the club record, and the players who reply when they are asked.",
  },
  {
    question: "Can players use MyClub on a phone?",
    answer:
      "Yes. Players reply to training and matches on the phone, and they can do the same in the browser.",
  },
  {
    question: "What can managers run from the web?",
    answer:
      "The roster, calendar, attendance, matches, and club finances. Photos, match documents, and tactics are stored for a later version and do not have screens yet.",
  },
  {
    question: "How do players get access?",
    answer:
      "You add a player on the roster and create a login. Leave the password blank to link an email that already has a MyClub account.",
  },
  {
    question: "Can one person manage more than one club?",
    answer:
      "One login can belong to more than one club. The same person can be a player in one club and a manager of another. A club switcher appears when there is more than one membership.",
  },
  {
    question: "Does MyClub track attendance and club finances?",
    answer:
      "Yes. Attendance rate, wins and losses, and the balance are calculated from the records you keep.",
  },
  {
    question: "What does MyClub cost?",
    answer:
      "Pricing is {{pricing}}. A public price is not listed on this page yet.",
  },
] as const;

const tagline = ["Players. Fixtures. Financials.", "All in One Place."];

function Reveal({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold: 0.16 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={shown ? "lp-reveal is-shown" : "lp-reveal"}>
      {children}
    </div>
  );
}

export function LandingPage() {
  const router = useRouter();
  const [active, setActive] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [blurred, setBlurred] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const scrollAnimation = useRef<{ stop: () => void } | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduceMotion(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    const nodes = navLinks
      .map((link) => document.getElementById(link.id))
      .filter((node): node is HTMLElement => node != null);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target.id) setActive(visible.target.id);
      },
      { rootMargin: "-20% 0px -55% 0px", threshold: [0.15, 0.4] },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const section = document.getElementById("steps");
    if (!section) return;
    let frame = 0;
    let timer = 0;
    const update = () => {
      frame = 0;
      const limit = (navRef.current?.getBoundingClientRect().bottom ?? 72) + 8;
      const next = section.getBoundingClientRect().top <= limit;
      setBlurred((current) => (current === next ? current : next));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
      window.clearTimeout(timer);
      timer = window.setTimeout(update, 50);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1080px)");
    const onChange = () => {
      if (media.matches) setOpen(false);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const items = panel ? [...panel.querySelectorAll<HTMLElement>("a")] : [];
    items[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
        return;
      }
      if (event.key !== "Tab" || items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function scrollToSection(id: string) {
    const node = document.getElementById(id);
    if (!node) return;
    scrollAnimation.current?.stop();
    const top = Math.max(
      0,
      node.getBoundingClientRect().top + window.scrollY - 96,
    );
    const nextHash = `#${id}`;
    if (reduceMotion) {
      window.scrollTo(0, top);
      history.replaceState(null, "", nextHash);
      return;
    }
    scrollAnimation.current = animate(window.scrollY, top, {
      duration: 0.75,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (value) => window.scrollTo(0, value),
    });
    history.replaceState(null, "", nextHash);
  }

  function onSectionClick(
    event: React.MouseEvent<HTMLAnchorElement>,
    id: string,
  ) {
    event.preventDefault();
    setOpen(false);
    scrollToSection(id);
  }

  return (
    <div className="lp">
      <div className="lp-nav-wrap">
        <header
          ref={navRef}
          className={blurred ? "lp-nav is-blurred" : "lp-nav"}
        >
          <span className="lp-nav-solid" aria-hidden="true" />
          <span
            className="lp-nav-frost"
            style={{
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
            }}
            aria-hidden="true"
          />
          <Link href="/" className="lp-brand title-2" aria-current="page">
            MyClub
          </Link>
          <nav className="lp-nav-links" aria-label="Page">
            {navLinks.map((link) => (
              <a
                key={link.id}
                href={link.href}
                className="lp-nav-link title-4"
                aria-current={active === link.id ? "location" : undefined}
                onClick={(event) => onSectionClick(event, link.id)}
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="lp-nav-actions">
            <Link
              href="/login"
              className="lp-button lp-button-primary button-sm"
            >
              START NOW
            </Link>
          </div>
          <button
            ref={toggleRef}
            type="button"
            className="lp-menu-button"
            aria-expanded={open}
            aria-controls="lp-menu"
            onClick={() => setOpen((value) => !value)}
          >
            <span
              className={open ? "lp-burger is-open" : "lp-burger"}
              aria-hidden="true"
            >
              <span />
              <span />
              <span />
            </span>
            <span className="lp-sr">{open ? "Close menu" : "Open menu"}</span>
          </button>
        </header>
      </div>
      <div
        id="lp-menu"
        ref={panelRef}
        className={open ? "lp-panel is-open" : "lp-panel"}
        hidden={!open}
        inert={!open}
      >
        <nav className="lp-panel-nav" aria-label="Mobile">
          {navLinks.map((link) => (
            <a
              key={link.id}
              href={link.href}
              className="lp-panel-link title-1"
              onClick={(event) => onSectionClick(event, link.id)}
            >
              {link.label}
            </a>
          ))}
          <Link
            href="/login"
            className="lp-panel-link title-1"
            onClick={() => setOpen(false)}
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="lp-button lp-button-primary button-md lp-panel-link"
            onClick={() => setOpen(false)}
          >
            Create your club
          </Link>
        </nav>
      </div>
      <main id="content" className="lp-main" tabIndex={-1}>
        <section className="lp-hero-section" aria-labelledby="hero-title">
          <img
            className="lp-hero-photo"
            src="/soccer-ground.jpg"
            alt="Aerial view of a soccer pitch"
          />
          <div className="lp-wrap lp-hero">
            <h1 id="hero-title" className="heading-1 lp-hero-title">
              <span className="lp-hero-line">Manage club resources</span>
              <span className="lp-hero-line">with lesser effort.</span>
            </h1>
          </div>
        </section>

        <Reveal>
          <section
            id="steps"
            className="lp-section"
            aria-labelledby="steps-title"
          >
            <div className="lp-wrap">
              <div className="lp-section-intro">
                <h2 id="steps-title" className="heading-3">
                  Few clicks away from managing your club.
                </h2>
              </div>
              <ol className="lp-steps">
                {steps.map((step, index) => (
                  <li className="lp-card" key={step.title}>
                    <p className="caption-3 lp-step-index">{index + 1}</p>
                    <h3 className="title-2">{step.title}</h3>
                    <p className="body-6">{step.copy}</p>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        </Reveal>

        <Reveal>
          <section
            id="benefits"
            className="lp-section"
            aria-labelledby="benefits-title"
          >
            <div className="lp-wrap">
              <div className="lp-section-intro">
                <h2 id="benefits-title" className="heading-3">
                  What you stop chasing
                </h2>
                <p className="body-3">
                  The week, the replies, and the club numbers stay with the
                  club.
                </p>
              </div>
              <div className="lp-benefits">
                {benefits.map((benefit) => (
                  <article className="lp-card" key={benefit.title}>
                    <Icon className="lp-icon" data={benefit.icon} size={24} />
                    <h3 className="title-2">{benefit.title}</h3>
                    <p className="body-6">{benefit.copy}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>
        </Reveal>

        <Reveal>
          <section
            className="lp-section lp-tagline-section"
            aria-labelledby="tagline"
          >
            <div className="lp-wrap">
              <TaglineReveal lines={tagline} />
            </div>
          </section>
        </Reveal>

        <Reveal>
          <section
            id="features"
            className="lp-section"
            aria-labelledby="features-title"
          >
            <div className="lp-wrap">
              <div className="lp-section-intro">
                <h2 id="features-title" className="heading-3">
                  What MyClub provides you with
                </h2>
              </div>
              <div className="lp-areas">
                {areas.map((area) => (
                  <article className="lp-card" key={area.title}>
                    <Icon className="lp-icon" data={area.icon} size={24} />
                    <h3 className="title-2">{area.title}</h3>
                    <p className="body-6">{area.copy}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>
        </Reveal>

        <Reveal>
          <section id="faq" className="lp-section" aria-labelledby="faq-title">
            <div className="lp-wrap">
              <div className="lp-section-intro lp-faq-intro">
                <h2 id="faq-title" className="heading-3">
                  FAQ
                </h2>
              </div>
              <div className="lp-faq">
                <Accordion className="lp-faq-accordion" variant="surface">
                  {faqs.map((item) => (
                    <Accordion.Item key={item.question} id={item.question}>
                      <Accordion.Heading>
                        <Accordion.Trigger className="title-2">
                          {item.question}
                          <Accordion.Indicator className="lp-faq-indicator">
                            <span>
                              <ChevronDown
                                aria-hidden="true"
                                className="lp-faq-chevron lp-faq-chevron-down"
                              />
                              <ChevronUp
                                aria-hidden="true"
                                className="lp-faq-chevron lp-faq-chevron-up"
                              />
                            </span>
                          </Accordion.Indicator>
                        </Accordion.Trigger>
                      </Accordion.Heading>
                      <Accordion.Panel>
                        <Accordion.Body className="body-3">
                          {item.question === "What does MyClub cost?" ? (
                            <>
                              Pricing is{" "}
                              <span className="lp-placeholder">
                                {"{{pricing}}"}
                              </span>
                              . A public price is not listed on this page yet.
                            </>
                          ) : (
                            item.answer
                          )}
                        </Accordion.Body>
                      </Accordion.Panel>
                    </Accordion.Item>
                  ))}
                </Accordion>
              </div>
            </div>
          </section>
        </Reveal>

        <section className="lp-final-band" aria-labelledby="final-title">
          <div className="lp-wrap">
            <div className="lp-final">
              <h2 id="final-title" className="heading-3">
                <span className="lp-hero-line">Start managing your club now.</span>
              </h2>
              <Button size="lg" onPress={() => router.push("/login")}>
                  Get Started
              </Button>
            </div>
          </div>
        </section>
      </main>
      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-grid">
          <p className="title-2">MyClub</p>
          <nav aria-label="Footer">
            <ul className="lp-footer-links">
              {navLinks.map((link) => (
                <li key={link.id}>
                  <a
                    href={link.href}
                    className="lp-footer-link title-4"
                    onClick={(event) => onSectionClick(event, link.id)}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
              <li>
                <Link href="/privacy" className="lp-footer-link title-4">
                  Privacy & Terms
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </footer>
    </div>
  );
}
