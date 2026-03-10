import type { SlideDeck, SlideSpec } from "@/lib/types";
import { normalizeSlideDeck, normalizeSlideSpec } from "./normalize";

function findUniqueTitleMatch(baseSlides: SlideSpec[], title: string): SlideSpec | null {
  const normalized = title.trim();
  if (!normalized) return null;
  const matches = baseSlides.filter((slide) => slide.title.trim() === normalized);
  return matches.length === 1 ? matches[0] : null;
}

function mergeSlide(base: SlideSpec | null, candidate: SlideSpec): SlideSpec {
  if (!base) return candidate;

  return {
    ...base,
    ...candidate,
    id: base.id,
    bullets: candidate.bullets,
    visuals: candidate.visuals.length > 0 ? candidate.visuals : base.visuals,
    body: candidate.body ?? base.body,
    speakerNotes: candidate.speakerNotes ?? base.speakerNotes,
    themeVariant: candidate.themeVariant ?? base.themeVariant,
  };
}

export function reconcileSlideDeck(input: {
  baseDeck: SlideDeck | null | undefined;
  nextDeck: SlideDeck | null | undefined;
  focusSlideId?: string | null;
}): SlideDeck | null {
  const nextDeck = normalizeSlideDeck(input.nextDeck);
  if (!nextDeck) {
    return normalizeSlideDeck(input.baseDeck);
  }

  const baseDeck = normalizeSlideDeck(input.baseDeck);
  if (!baseDeck) {
    return nextDeck;
  }

  const baseById = new Map(baseDeck.slides.map((slide) => [slide.id, slide]));
  const focusSlide =
    input.focusSlideId
      ? baseDeck.slides.find((slide) => slide.id === input.focusSlideId) ?? null
      : null;

  const mergedSlides = nextDeck.slides.map((candidate, index) => {
    const direct = baseById.get(candidate.id);
    const titleMatch = findUniqueTitleMatch(baseDeck.slides, candidate.title);
    const positional = baseDeck.slides[index] ?? null;
    const fallback =
      direct ??
      (nextDeck.slides.length === 1 ? focusSlide : null) ??
      titleMatch ??
      positional;

    return mergeSlide(fallback, normalizeSlideSpec(candidate, index));
  });

  if (nextDeck.slides.length === 1 && focusSlide) {
    const targetIndex = baseDeck.slides.findIndex(
      (slide) => slide.id === focusSlide.id
    );
    if (targetIndex >= 0) {
      const combinedSlides = [...baseDeck.slides];
      combinedSlides[targetIndex] = mergedSlides[0];
      return {
        ...baseDeck,
        ...nextDeck,
        slides: combinedSlides,
      };
    }
  }

  return {
    ...baseDeck,
    ...nextDeck,
    slides: mergedSlides,
  };
}
