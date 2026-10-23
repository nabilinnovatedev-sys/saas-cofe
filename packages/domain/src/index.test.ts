import { describe, expect, it } from "vitest";
import {
  accessibleBrandColor,
  canTransition,
  cartTotal,
  contrastRatio,
  normalizeSlug,
} from "./index";

describe("cycle de commande", () => {
  it("autorise uniquement le chemin canonique", () => {
    expect(canTransition("nouvelle", "acceptee")).toBe(true);
    expect(canTransition("nouvelle", "servie")).toBe(false);
    expect(canTransition("prete", "annulee", "Client parti")).toBe(true);
    expect(canTransition("prete", "annulee")).toBe(false);
    expect(canTransition("servie", "annulee", "x")).toBe(false);
  });
});

describe("règles client", () => {
  it("calcule en unités mineures", () => {
    expect(
      cartTotal([
        {
          product: {
            id: "1",
            category_id: "c",
            name: "Café",
            description: null,
            price_minor: 3200,
            photo_url: null,
            available: true,
            sort_order: 0,
          },
          quantity: 2,
        },
      ]),
    ).toBe(6400);
  });
  it("normalise les slugs", () =>
    expect(normalizeSlug("Café Atlas !")).toBe("cafe-atlas"));
  it("corrige une couleur trop claire pour le texte blanc", () => {
    expect(
      contrastRatio(accessibleBrandColor("#FFE066"), "#FFFFFF"),
    ).toBeGreaterThanOrEqual(4.5);
  });
});
