---
title: Brightness
category: Guides
group: Services
---

The `Brightness` service reads and controls screen backlight via the
locally-built `Brightness` GIR library, which performs direct sysfs I/O on
`/sys/class/backlight/<device>/brightness`. No external process is spawned.

> [!NOTE]
> Write permission on the sysfs brightness file is a system-level concern. Grant
> it with a udev rule (`TAG+="uaccess"`) or by adding the user to the `video`
> group.

## properties

- `screen`: `number`: current brightness as a fraction in `[0, 1]`, readable and
  writable
- `device_name`: `string`: the `/sys/class/backlight` device in use (read-only)

## constructor

```js
const brightness = await Service.import("brightness");

// Uses the first available backlight device by default.
// Pass a device name to select a specific one:
const brightness = new Brightness("intel_backlight");
```

## Example Widget

```js
const brightness = await Service.import("brightness");

const BrightnessSlider = () =>
  Widget.Slider({
    min: 0,
    max: 1,
    value: brightness.bind("screen"),
    onChange: ({ value }) => {
      brightness.screen = value;
    },
  });
```
