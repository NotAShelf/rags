#pragma once

#include <glib-object.h>
#include <gio/gio.h>

G_BEGIN_DECLS

#define BRIGHTNESS_TYPE_DEVICE (brightness_device_get_type())
G_DECLARE_FINAL_TYPE(BrightnessDevice, brightness_device, BRIGHTNESS, DEVICE, GObject)

/**
 * brightness_enumerate_devices:
 *
 * Lists all backlight device names found under /sys/class/backlight.
 *
 * Returns: (transfer full) (array zero-terminated=1): NULL-terminated array
 *   of device name strings; free with g_strfreev()
 */
char **brightness_enumerate_devices(void);

/**
 * brightness_device_new:
 * @name: directory name under /sys/class/backlight
 *
 * Creates a #BrightnessDevice for the named backlight.  Reads the current and
 * maximum brightness from sysfs at construction time.
 *
 * Returns: (transfer full): a new #BrightnessDevice, or %NULL on error
 */
BrightnessDevice *brightness_device_new(const char *name);

/**
 * brightness_device_get_name:
 * @self: a #BrightnessDevice
 *
 * Returns: (transfer none): the backlight device name
 */
const char *brightness_device_get_name(BrightnessDevice *self);

/**
 * brightness_device_get_brightness:
 * @self: a #BrightnessDevice
 *
 * Returns the cached brightness last read or written.  Call
 * brightness_device_refresh() to re-read from sysfs.
 *
 * Returns: current brightness, or -1 on error
 */
gint brightness_device_get_brightness(BrightnessDevice *self);

/**
 * brightness_device_get_max_brightness:
 * @self: a #BrightnessDevice
 *
 * Returns: maximum brightness value
 */
gint brightness_device_get_max_brightness(BrightnessDevice *self);

/**
 * brightness_device_set_brightness:
 * @self: a #BrightnessDevice
 * @value: new raw brightness value (clamped to [0, max-brightness])
 * @error: (nullable): return location for a #GError, or %NULL
 *
 * Writes @value directly to /sys/class/backlight/<name>/brightness.
 * Requires write permission on that file (video group or udev rule).
 *
 * Returns: %TRUE on success
 */
gboolean brightness_device_set_brightness(BrightnessDevice *self,
                                           gint              value,
                                           GError          **error);

/**
 * brightness_device_refresh:
 * @self: a #BrightnessDevice
 * @error: (nullable): return location for a #GError, or %NULL
 *
 * Re-reads the current brightness from sysfs and updates the cached value.
 * Emits #BrightnessDevice::changed if the value differs from the cached one.
 *
 * Returns: the new brightness value, or -1 on error
 */
gint brightness_device_refresh(BrightnessDevice *self, GError **error);

G_END_DECLS
