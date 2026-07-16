import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const SELECTORS = {
  card: ".post-card-animate",
  staggerList: "[data-animate-stagger]",
  contentBlock: ".markdown-content > *",
  friendCard: ".friend-card-animate",
  archiveTimeline: ".archive-timeline-animate",
} as const;

const ownedScrollTriggers = new Set<ScrollTrigger>();
const ownedTweens = new Set<gsap.core.Tween>();
let animationMedia: ReturnType<typeof gsap.matchMedia> | null = null;

function registerScrollTriggers(triggers: ScrollTrigger[]) {
  triggers.forEach((trigger) => ownedScrollTriggers.add(trigger));
}

function registerTween(tween: gsap.core.Tween) {
  ownedTweens.add(tween);
  return tween;
}

function createScrollAnimations() {
  // ── Post cards: batch stagger fade-up ──
  const cards = gsap.utils.toArray<HTMLElement>(SELECTORS.card);
  if (cards.length > 0) {
    registerScrollTriggers(
      ScrollTrigger.batch(cards, {
        onEnter: (elements) => {
          registerTween(
            gsap.fromTo(
              elements,
              { opacity: 0, y: 32 },
              {
                opacity: 1,
                y: 0,
                stagger: 0.08,
                duration: 0.55,
                ease: "power2.out",
                overwrite: "auto",
              },
            ),
          );
        },
        start: "top 92%",
        once: true,
      }),
    );
  }

  // ── Generic stagger containers (friends, sponsors, etc.) ──
  const staggerContainers = document.querySelectorAll<HTMLElement>(SELECTORS.staggerList);
  staggerContainers.forEach((container) => {
    const items = gsap.utils.toArray<HTMLElement>(container.children);
    if (items.length === 0) return;
    registerScrollTriggers(
      ScrollTrigger.batch(items, {
        onEnter: (elements) => {
          registerTween(
            gsap.fromTo(
              elements,
              { opacity: 0, y: 28, scale: 0.96 },
              {
                opacity: 1,
                y: 0,
                scale: 1,
                stagger: 0.06,
                duration: 0.5,
                ease: "power2.out",
                overwrite: "auto",
              },
            ),
          );
        },
        start: "top 94%",
        once: true,
      }),
    );
  });

  // ── Markdown content blocks: fade-up paragraph by paragraph ──
  const contentContainers = document.querySelectorAll<HTMLElement>(".markdown-content");
  contentContainers.forEach((container) => {
    const blocks = gsap.utils.toArray<HTMLElement>(
      container.querySelectorAll(
        "p, ul, ol, blockquote, pre, .table-wrapper, h2, h3, h4, h5, h6",
      ),
    );
    if (blocks.length === 0) return;
    registerScrollTriggers(
      ScrollTrigger.batch(blocks, {
        onEnter: (elements) => {
          registerTween(
            gsap.fromTo(
              elements,
              { opacity: 0, y: 18 },
              {
                opacity: 1,
                y: 0,
                stagger: 0.04,
                duration: 0.45,
                ease: "power2.out",
                overwrite: "auto",
              },
            ),
          );
        },
        start: "top 95%",
        once: true,
      }),
    );
  });

  // ── Archive timeline items ──
  const timelineItems = document.querySelectorAll<HTMLElement>(SELECTORS.archiveTimeline);
  if (timelineItems.length > 0) {
    gsap.utils.toArray<HTMLElement>(timelineItems).forEach((item) => {
      const tween = registerTween(
        gsap.fromTo(
          item,
          { opacity: 0, x: -16 },
          {
            opacity: 1,
            x: 0,
            duration: 0.4,
            ease: "power2.out",
            scrollTrigger: {
              trigger: item,
              start: "top 95%",
              once: true,
            },
          },
        ),
      );
      if (tween.scrollTrigger) {
        ownedScrollTriggers.add(tween.scrollTrigger);
      }
    });
  }
}

function cleanupOwnedAnimations() {
  ownedScrollTriggers.forEach((trigger) => trigger.kill());
  ownedScrollTriggers.clear();
  ownedTweens.forEach((tween) => tween.revert());
  ownedTweens.clear();
}

function cleanupScrollAnimations() {
  const media = animationMedia;
  animationMedia = null;
  media?.revert();
  cleanupOwnedAnimations();
}

function initScrollAnimations() {
  cleanupScrollAnimations();
  animationMedia = gsap.matchMedia();
  animationMedia.add("(prefers-reduced-motion: no-preference)", () => {
    createScrollAnimations();
    return cleanupOwnedAnimations;
  });
}

// ── Init on page load ──
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initScrollAnimations);
} else {
  initScrollAnimations();
}

// ── Re-init after Swup page transitions ──
document.addEventListener("swup:contentReplaced", () => {
  initScrollAnimations();
});

// ── Cleanup before Swup replaces content ──
document.addEventListener("swup:content:replace", cleanupScrollAnimations);
