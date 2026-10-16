import assert from "node:assert/strict";
import {
  CURATED_THEMES,
  DEFAULT_ACCENT_THEME,
  DEFAULT_COLOR_ARCHIVE,
  DEFAULT_CUSTOM_HEX,
  deriveCustomColorVariables,
  getContrastForeground,
  hexToRgb,
} from "../color-theme.js";

console.log("Starting Color Theme Engine Tests...");

// 1. Verify default theme is sapphire
assert.equal(DEFAULT_ACCENT_THEME, "sapphire");
assert.equal(CURATED_THEMES.sapphire.id, "sapphire");
assert.equal(CURATED_THEMES.sapphire.hex, "#2563EB");

// 2. Verify exactly 5 additional curated themes exist
const keys = Object.keys(CURATED_THEMES);
assert.equal(keys.length, 6, "Must have 6 curated themes (sapphire + 5 curated)");
assert.deepEqual(
  keys.sort(),
  ["amber", "amethyst", "emerald", "ruby", "sapphire", "topaz"].sort()
);

// 3. Test Hex to RGB conversion
assert.deepEqual(hexToRgb("#2563EB"), { r: 37, g: 99, b: 235 });
assert.deepEqual(hexToRgb("#000000"), { r: 0, g: 0, b: 0 });
assert.deepEqual(hexToRgb("#FFFFFF"), { r: 255, g: 255, b: 255 });

// 4. Test Contrast calculation
assert.equal(getContrastForeground("#FFFFFF"), "oklch(0.12 0 0)", "Light color must have dark text");
assert.equal(getContrastForeground("#000000"), "oklch(1 0 0)", "Dark color must have white text");
assert.equal(getContrastForeground("#2563EB"), "oklch(1 0 0)", "Royal blue must have white text");

// 5. Test Custom Color Derivation
const derived = deriveCustomColorVariables("#10B981");
assert.ok(derived.dark.primary.includes("rgb(16 185 129)"));
assert.ok(derived.dark.ring.includes("rgb(16 185 129 / 0.6)"));
assert.ok(derived.light.primary);
assert.ok(derived.light.ring);

// 6. Test Default Archive
assert.ok(DEFAULT_COLOR_ARCHIVE.length >= 8);
assert.ok(DEFAULT_COLOR_ARCHIVE.some((item) => item.hex === "#2563EB"));
assert.ok(DEFAULT_COLOR_ARCHIVE.some((item) => item.hex === "#059669"));

console.log("All Color Theme Engine tests passed successfully!");
