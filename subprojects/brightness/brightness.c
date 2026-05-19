#include "brightness.h"

#include <errno.h>
#include <fcntl.h>
#include <string.h>
#include <unistd.h>

#define BACKLIGHT_DIR "/sys/class/backlight"

/* Read a small integer from a sysfs file.  sysfs reports st_size == 0, so
 * g_file_get_contents' seek-based sizing is unreliable; use raw read(). */
static gint read_sysfs_int(const char *path, GError **error) {
  char buf[32] = {0};
  int fd;
  ssize_t n;

  fd = open(path, O_RDONLY | O_CLOEXEC);
  if (fd < 0) {
    g_set_error(error, G_IO_ERROR, g_io_error_from_errno(errno), "open %s: %s",
                path, g_strerror(errno));
    return -1;
  }

  n = read(fd, buf, sizeof(buf) - 1);
  close(fd);

  if (n < 0) {
    g_set_error(error, G_IO_ERROR, g_io_error_from_errno(errno), "read %s: %s",
                path, g_strerror(errno));
    return -1;
  }

  return (gint)g_ascii_strtoll(buf, NULL, 10);
}

/* Write an integer to a sysfs file.  g_file_set_contents uses rename() which
 * does not work on virtual sysfs paths; write directly. */
static gboolean write_sysfs_int(const char *path, gint value, GError **error) {
  char buf[32];
  int len;
  int fd;
  ssize_t written;

  len = g_snprintf(buf, sizeof(buf), "%d", value);

  fd = open(path, O_WRONLY | O_CLOEXEC);
  if (fd < 0) {
    g_set_error(error, G_IO_ERROR, g_io_error_from_errno(errno), "open %s: %s",
                path, g_strerror(errno));
    return FALSE;
  }

  written = write(fd, buf, (size_t)len);
  close(fd);

  if (written < 0) {
    g_set_error(error, G_IO_ERROR, g_io_error_from_errno(errno), "write %s: %s",
                path, g_strerror(errno));
    return FALSE;
  }

  return TRUE;
}

struct _BrightnessDevice {
  GObject parent_instance;

  char *name;
  char *sysfs_path; // /sys/class/backlight/<name>
  gint brightness;
  gint max_brightness;
};

G_DEFINE_TYPE(BrightnessDevice, brightness_device, G_TYPE_OBJECT)

enum { PROP_0, PROP_NAME, PROP_BRIGHTNESS, PROP_MAX_BRIGHTNESS, N_PROPS };

enum { SIGNAL_CHANGED, N_SIGNALS };

static GParamSpec *obj_props[N_PROPS];
static guint obj_signals[N_SIGNALS];

static void brightness_device_finalize(GObject *object) {
  BrightnessDevice *self = BRIGHTNESS_DEVICE(object);

  g_free(self->name);
  g_free(self->sysfs_path);

  G_OBJECT_CLASS(brightness_device_parent_class)->finalize(object);
}

static void brightness_device_get_property(GObject *object, guint prop_id,
                                           GValue *value, GParamSpec *pspec) {
  BrightnessDevice *self = BRIGHTNESS_DEVICE(object);

  switch (prop_id) {
  case PROP_NAME:
    g_value_set_string(value, self->name);
    break;
  case PROP_BRIGHTNESS:
    g_value_set_int(value, self->brightness);
    break;
  case PROP_MAX_BRIGHTNESS:
    g_value_set_int(value, self->max_brightness);
    break;
  default:
    G_OBJECT_WARN_INVALID_PROPERTY_ID(object, prop_id, pspec);
  }
}

static void brightness_device_set_property(GObject *object, guint prop_id,
                                           const GValue *value,
                                           GParamSpec *pspec) {
  BrightnessDevice *self = BRIGHTNESS_DEVICE(object);

  switch (prop_id) {
  case PROP_BRIGHTNESS:
    brightness_device_set_brightness(self, g_value_get_int(value), NULL);
    break;
  default:
    G_OBJECT_WARN_INVALID_PROPERTY_ID(object, prop_id, pspec);
  }
}

static void brightness_device_class_init(BrightnessDeviceClass *klass) {
  GObjectClass *object_class = G_OBJECT_CLASS(klass);

  object_class->finalize = brightness_device_finalize;
  object_class->get_property = brightness_device_get_property;
  object_class->set_property = brightness_device_set_property;

  obj_props[PROP_NAME] =
      g_param_spec_string("name", "Name", "Backlight device name", NULL,
                          G_PARAM_READABLE | G_PARAM_STATIC_STRINGS);

  obj_props[PROP_BRIGHTNESS] =
      g_param_spec_int("brightness", "Brightness", "Current raw brightness", 0,
                       G_MAXINT, 0, G_PARAM_READWRITE | G_PARAM_STATIC_STRINGS);

  obj_props[PROP_MAX_BRIGHTNESS] = g_param_spec_int(
      "max-brightness", "Max Brightness", "Maximum raw brightness", 0, G_MAXINT,
      0, G_PARAM_READABLE | G_PARAM_STATIC_STRINGS);

  g_object_class_install_properties(object_class, N_PROPS, obj_props);

  /**
   * BrightnessDevice::changed:
   *
   * Emitted after brightness is successfully written via
   * brightness_device_set_brightness(), or when a re-read via
   * brightness_device_refresh() finds a new value.
   */
  obj_signals[SIGNAL_CHANGED] =
      g_signal_new("changed", G_TYPE_FROM_CLASS(klass), G_SIGNAL_RUN_LAST, 0,
                   NULL, NULL, NULL, G_TYPE_NONE, 0);
}

static void brightness_device_init(BrightnessDevice *self) { (void)self; }

/**
 * brightness_enumerate_devices:
 *
 * Lists all backlight device names found under /sys/class/backlight.
 *
 * Returns: (transfer full) (array zero-terminated=1): NULL-terminated array
 *   of device name strings; free with g_strfreev()
 */
char **brightness_enumerate_devices(void) {
  GDir *dir;
  GPtrArray *names;
  const char *entry;

  dir = g_dir_open(BACKLIGHT_DIR, 0, NULL);
  if (!dir)
    return g_new0(char *, 1);

  names = g_ptr_array_new();

  while ((entry = g_dir_read_name(dir)) != NULL) {
    char *device_path = g_build_filename(BACKLIGHT_DIR, entry, NULL);
    if (g_file_test(device_path, G_FILE_TEST_IS_DIR))
      g_ptr_array_add(names, g_strdup(entry));
    g_free(device_path);
  }

  g_dir_close(dir);
  g_ptr_array_add(names, NULL);

  return (char **)g_ptr_array_free(names, FALSE);
}

/**
 * brightness_device_new:
 * @name: directory name under /sys/class/backlight
 *
 * Creates a #BrightnessDevice for the named backlight.
 *
 * Returns: (transfer full): a new #BrightnessDevice, or %NULL on error
 */
BrightnessDevice *brightness_device_new(const char *name) {
  BrightnessDevice *self;
  GError *error = NULL;
  char *path;
  char *brightness_path;
  char *max_path;
  gint brightness;
  gint max_brightness;

  g_return_val_if_fail(name != NULL, NULL);

  path = g_build_filename(BACKLIGHT_DIR, name, NULL);

  if (!g_file_test(path, G_FILE_TEST_IS_DIR)) {
    g_warning("brightness: device '%s' not found under " BACKLIGHT_DIR, name);
    g_free(path);
    return NULL;
  }

  brightness_path = g_build_filename(path, "brightness", NULL);
  max_path = g_build_filename(path, "max_brightness", NULL);

  brightness = read_sysfs_int(brightness_path, &error);
  if (error) {
    g_warning("brightness: %s", error->message);
    g_clear_error(&error);
    g_free(path);
    g_free(brightness_path);
    g_free(max_path);
    return NULL;
  }

  max_brightness = read_sysfs_int(max_path, &error);
  if (error) {
    g_warning("brightness: %s", error->message);
    g_clear_error(&error);
    g_free(path);
    g_free(brightness_path);
    g_free(max_path);
    return NULL;
  }

  g_free(brightness_path);
  g_free(max_path);

  self = g_object_new(BRIGHTNESS_TYPE_DEVICE, NULL);
  self->name = g_strdup(name);
  self->sysfs_path = path;
  self->brightness = brightness;
  self->max_brightness = max_brightness;

  return self;
}

/**
 * brightness_device_get_name:
 * @self: a #BrightnessDevice
 *
 * Returns: (transfer none): the backlight device name
 */
const char *brightness_device_get_name(BrightnessDevice *self) {
  g_return_val_if_fail(BRIGHTNESS_IS_DEVICE(self), NULL);
  return self->name;
}

/**
 * brightness_device_get_brightness:
 * @self: a #BrightnessDevice
 *
 * Returns the last read or written brightness value.
 *
 * Returns: cached brightness, or -1 if uninitialised
 */
gint brightness_device_get_brightness(BrightnessDevice *self) {
  g_return_val_if_fail(BRIGHTNESS_IS_DEVICE(self), -1);
  return self->brightness;
}

/**
 * brightness_device_get_max_brightness:
 * @self: a #BrightnessDevice
 *
 * Returns: maximum brightness value
 */
gint brightness_device_get_max_brightness(BrightnessDevice *self) {
  g_return_val_if_fail(BRIGHTNESS_IS_DEVICE(self), -1);
  return self->max_brightness;
}

/**
 * brightness_device_set_brightness:
 * @self: a #BrightnessDevice
 * @value: new raw brightness (clamped to [0, max-brightness])
 * @error: (nullable): return location for a #GError, or %NULL
 *
 * Writes @value directly to /sys/class/backlight/<name>/brightness.
 * The calling process must have write permission on that file (video group or
 * a udev rule such as `TAG+="uaccess"`).
 *
 * Returns: %TRUE on success
 */
gboolean brightness_device_set_brightness(BrightnessDevice *self, gint value,
                                          GError **error) {
  char *path;
  gboolean ok;

  g_return_val_if_fail(BRIGHTNESS_IS_DEVICE(self), FALSE);

  value = CLAMP(value, 0, self->max_brightness);
  path = g_build_filename(self->sysfs_path, "brightness", NULL);
  ok = write_sysfs_int(path, value, error);
  g_free(path);

  if (ok) {
    self->brightness = value;
    g_object_notify_by_pspec(G_OBJECT(self), obj_props[PROP_BRIGHTNESS]);
    g_signal_emit(self, obj_signals[SIGNAL_CHANGED], 0);
  }

  return ok;
}

/**
 * brightness_device_refresh:
 * @self: a #BrightnessDevice
 * @error: (nullable): return location for a #GError, or %NULL
 *
 * Re-reads the current brightness from sysfs.  Emits #BrightnessDevice::changed
 * if the value has changed since the last read or write.
 *
 * Returns: the (possibly updated) brightness value, or -1 on error
 */
gint brightness_device_refresh(BrightnessDevice *self, GError **error) {
  char *path;
  gint value;

  g_return_val_if_fail(BRIGHTNESS_IS_DEVICE(self), -1);

  path = g_build_filename(self->sysfs_path, "brightness", NULL);
  value = read_sysfs_int(path, error);
  g_free(path);

  if (value < 0)
    return -1;

  if (value != self->brightness) {
    self->brightness = value;
    g_object_notify_by_pspec(G_OBJECT(self), obj_props[PROP_BRIGHTNESS]);
    g_signal_emit(self, obj_signals[SIGNAL_CHANGED], 0);
  }

  return value;
}
