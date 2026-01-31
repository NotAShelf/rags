---
title: Theme Switching
description: Register and switch CSS themes at runtime
category: Guides
group: Configuration
---

RAGS supports registering multiple named CSS themes and switching between them
at runtime without restarting the shell.

## Registering themes

Themes can be registered in the config object or at any point during runtime.

### Via config

```js
App.config({
  style: "./style.css",
  themes: {
    "catppuccin": "./themes/catppuccin.css",
    "nord": "./themes/nord.css",
    "gruvbox": "./themes/gruvbox.css",
  },
  windows: [Bar()],
});
```

### At runtime

```js
App.registerTheme("custom", "/path/to/custom-theme.css");
```

You can also pass inline CSS instead of a file path:

```js
App.registerTheme(
  "red-accent",
  `
    @define-color primary #f38ba8;
    @define-color surface #1e1e2e;
`,
);
```

## Switching themes

```js
App.setTheme("catppuccin");
```

This calls `App.applyCss(css, true)` — the `true` flag resets all previously
applied CSS before applying the theme. This means your base styles and theme
colours should live in the same CSS file, or you should apply your base styles
after switching:

```js
App.setTheme("nord");
App.applyCss("./style.css"); // re-apply base styles on top
```

## Reading the active theme

```js
App.activeTheme; // 'catppuccin' | 'nord' | null
```

Returns `null` if no theme has been set via `setTheme()`.

## GTK3 colour variables

GTK3 does **not** support CSS custom properties (`var(--foo)`). Instead, use
`@define-color` declarations, which GTK3 does support:

```css
/* themes/catppuccin.css */
@define-color primary #cba6f7;
@define-color surface #1e1e2e;
@define-color on_surface #cdd6f4;
@define-color accent #f38ba8;
```

Reference them in widget styles with the `@` syntax:

```css
/* style.css */
.bar {
    background-color: @surface;
    color: @on_surface;
}

.bar .module {
    color: @primary;
}

.bar .active {
    background-color: @accent;
}
```

When you call `App.setTheme()`, the new `@define-color` values override the
previous ones and all widgets re-render with the new colours.

## Example: theme switcher button

```js
const themes = ["catppuccin", "nord", "gruvbox"];
let current = 0;

function ThemeSwitcher() {
  return Widget.Button({
    label: "Switch Theme",
    on_clicked: () => {
      current = (current + 1) % themes.length;
      App.setTheme(themes[current]);
      App.applyCss("./style.css"); // re-apply base layout
    },
  });
}
```

## Using with SCSS pre-processors

If you use SCSS, compile each theme to a separate CSS file and register them:

```js
const themes = ["catppuccin", "nord"];

for (const name of themes) {
  Utils.exec(`sassc ${App.configDir}/themes/${name}.scss /tmp/ags-${name}.css`);
  App.registerTheme(name, `/tmp/ags-${name}.css`);
}
```
