/**
 * Which layout a screen gets. The site is drawn on a stage that is scaled to fit the window:
 *  - desktop: a 1920 x 1080 stage (laptops, tablets on their side, big and ultrawide monitors)
 *  - compact: the phone layout (camera on top, the sign to show, no letter grid) on a narrow stage:
 *      480 px wide on phones, 640 px wide on tablets held upright
 *  - a phone on its side is too short for the site's pages, so it gets a "rotate your phone" notice
 */
export type LayoutMode = "desktop" | "compact";

export type Layout = {
  mode: LayoutMode;
  /** Width of the drawing stage in CSS pixels (its height follows the window's shape). */
  stageWidth: number;
  /** A phone held sideways: show the rotate notice. */
  rotatePrompt: boolean;
};

export const PHONE_MAX_WIDTH = 639; // same cut-off as Tailwind's `sm` (640 px)
export const TABLET_PORTRAIT_MAX_WIDTH = 1100;

export function computeLayout(width: number, height: number): Layout {
  if (width <= PHONE_MAX_WIDTH) return { mode: "compact", stageWidth: 480, rotatePrompt: false };
  const portrait = height > width;
  if (portrait && width <= TABLET_PORTRAIT_MAX_WIDTH) return { mode: "compact", stageWidth: 640, rotatePrompt: false };
  const phoneOnItsSide = width > height && height < 500 && width < 1000;
  return { mode: "desktop", stageWidth: 1920, rotatePrompt: phoneOnItsSide };
}
