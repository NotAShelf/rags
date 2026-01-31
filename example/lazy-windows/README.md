# Lazy Windows

Demonstrates `lazyWindows`, a.k.a, windows that are only constructed when first
opened, reducing startup time. The bar is created immediately. The dashboard and
power menu are registered as factories and only built when you click their
buttons (or toggle them via `ags --toggle-window`).

## Setup

```bash
mkdir -p ~/.config/ags
cp -r example/lazy-windows/* ~/.config/ags
```

## Running

```bash
ags -c ~/.config/ags/config.js &
```

Open the dashboard or power menu by clicking the buttons in the bar, or from the
CLI:

```bash
ags --toggle-window dashboard
ags --toggle-window powermenu
```
