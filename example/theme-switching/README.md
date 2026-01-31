# Theme Switching

Dynamic theme switching is something AGS users implement by hand most of the
time. RAGS introduces dynamic theme switching through native GTK CSS featutes to
make your lives easier. This example demonstrates runtime theme switching using
`App.registerTheme()` and `App.setTheme()` with GTK3 `@define-color` variables.

Three themes are included:

- Catppuccin Mocha
- Nord
- Gruvbox Dark.

Click the theme button in the bar to cycle through them.

## Setup

```bash
mkdir -p ~/.config/ags
cp -r example/theme-switching/* ~/.config/ags
```

## Running

```bash
ags -c ~/.config/ags/config.js &
```

Click the "Theme: ..." button in the bar to cycle between themes.

## How it works

Each theme file defines four `@define-color` values. The base `style.css`
references these colours with the `@name` syntax (GTK3's equivalent of CSS
custom properties).

Calling `App.setTheme('nord')` resets all CSS and applies `themes/nord.css`,
then the config re-applies `style.css` on top so the layout rules pick up the
new colour definitions.

## Adding your own theme

Create a new CSS file in `themes/` with the four colour definitions:

```css
@define-color primary #...;
@define-color accent #...;
@define-color surface #...;
@define-color on_surface #...;
```

Then add it to the `themes` object in `config.js` and append the name to the
`themes` array.
