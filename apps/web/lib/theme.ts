"use client";

const themeKey = "mc-theme";

export function readDark() {
  return document.documentElement.classList.contains("dark");
}

export function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  localStorage.setItem(themeKey, dark ? "dark" : "light");
}
