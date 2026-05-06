#include "session-lock.h"
#include "ext-session-lock-v1-client-protocol.h"
#include <cairo/cairo.h>
#include <errno.h>
#include <fcntl.h>
#include <glib.h>
#include <stdlib.h>
#include <string.h>
#include <sys/mman.h>
#include <unistd.h>
#include <wayland-client.h>
#include <xkbcommon/xkbcommon.h>

typedef struct {
  struct wl_buffer *buffer;
  uint32_t *data;
  uint32_t width;
  uint32_t height;
  uint32_t stride;
  size_t size;
} ShmBuffer;

static void buffer_release(void *data, struct wl_buffer *buffer) {
  (void)data;
  wl_buffer_destroy(buffer);
}

static const struct wl_buffer_listener buffer_listener = {
    .release = buffer_release,
};

static ShmBuffer *shm_buffer_create(struct wl_shm *shm, uint32_t width,
                                    uint32_t height) {
  uint32_t stride = width * 4;
  size_t size = stride * height;

  char path[] = "/tmp/ags-lock-XXXXXX";
  int fd = mkstemp(path);
  if (fd < 0) {
    g_critical("mkstemp failed: %s", strerror(errno));
    return NULL;
  }

  if (ftruncate(fd, size) < 0) {
    g_critical("ftruncate failed: %s", strerror(errno));
    close(fd);
    unlink(path);
    return NULL;
  }

  void *addr = mmap(NULL, size, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
  if (addr == MAP_FAILED) {
    g_critical("mmap failed: %s", strerror(errno));
    close(fd);
    unlink(path);
    return NULL;
  }

  struct wl_shm_pool *pool = wl_shm_create_pool(shm, fd, size);
  struct wl_buffer *buffer = wl_shm_pool_create_buffer(
      pool, 0, width, height, stride, WL_SHM_FORMAT_ARGB8888);
  wl_shm_pool_destroy(pool);
  close(fd);
  unlink(path);

  wl_buffer_add_listener(buffer, &buffer_listener, NULL);

  ShmBuffer *buf = g_new0(ShmBuffer, 1);
  buf->buffer = buffer;
  buf->data = addr;
  buf->width = width;
  buf->height = height;
  buf->stride = stride;
  buf->size = size;
  return buf;
}

static void shm_buffer_destroy(ShmBuffer *buf) {
  if (!buf)
    return;
  if (buf->buffer)
    wl_buffer_destroy(buf->buffer);
  if (buf->data)
    munmap(buf->data, buf->size);
  g_free(buf);
}

typedef struct {
  struct wl_output *output;
  char *name;
} OutputInfo;

static void output_info_free(OutputInfo *info) {
  if (info) {
    g_free(info->name);
    g_free(info);
  }
}

struct _GUtilsSessionLockSurface {
  GObject parent;

  struct wl_surface *wl_surface;
  struct ext_session_lock_surface_v1 *lock_surface;
  struct wl_shm *wl_shm;

  char *output_name;
  int32_t width;
  int32_t height;
  uint32_t configure_serial;

  ShmBuffer *buffer;
  cairo_surface_t *cairo_surface;
  cairo_t *cairo;

  struct wl_callback *frame_callback;
};

enum {
  SURFACE_KEY_PRESSED,
  SURFACE_POINTER_MOTION,
  SURFACE_POINTER_BUTTON,
  SURFACE_CONFIGURE,
  N_SURFACE_SIGNALS
};

static guint surface_signals[N_SURFACE_SIGNALS];

G_DEFINE_TYPE(GUtilsSessionLockSurface, gutils_session_lock_surface,
              G_TYPE_OBJECT)

static void surface_frame_callback(void *data, struct wl_callback *callback,
                                   uint32_t time) {
  GUtilsSessionLockSurface *surface = GUTILS_SESSION_LOCK_SURFACE(data);
  wl_callback_destroy(callback);
  surface->frame_callback = NULL;
  g_signal_emit(surface, surface_signals[SURFACE_CONFIGURE], 0);
}

static const struct wl_callback_listener frame_listener = {
    .done = surface_frame_callback,
};

static void
lock_surface_configure(void *data,
                       struct ext_session_lock_surface_v1 *lock_surface,
                       uint32_t serial, uint32_t width, uint32_t height) {
  GUtilsSessionLockSurface *surface = GUTILS_SESSION_LOCK_SURFACE(data);
  surface->configure_serial = serial;

  if ((int32_t)width != surface->width || (int32_t)height != surface->height) {
    surface->width = (int32_t)width;
    surface->height = (int32_t)height;

    if (surface->cairo) {
      cairo_destroy(surface->cairo);
      surface->cairo = NULL;
    }
    if (surface->cairo_surface) {
      cairo_surface_destroy(surface->cairo_surface);
      surface->cairo_surface = NULL;
    }
    if (surface->buffer) {
      shm_buffer_destroy(surface->buffer);
      surface->buffer = NULL;
    }

    surface->buffer = shm_buffer_create(surface->wl_shm, width, height);
    if (surface->buffer) {
      surface->cairo_surface = cairo_image_surface_create_for_data(
          (unsigned char *)surface->buffer->data, CAIRO_FORMAT_ARGB32,
          (int)width, (int)height, (int)surface->buffer->stride);
      surface->cairo = cairo_create(surface->cairo_surface);
    }
  }

  ext_session_lock_surface_v1_ack_configure(lock_surface, serial);
}

static const struct ext_session_lock_surface_v1_listener lock_surface_listener =
    {
        .configure = lock_surface_configure,
};

static void
gutils_session_lock_surface_init(GUtilsSessionLockSurface *surface) {
  (void)surface;
}

static void gutils_session_lock_surface_dispose(GObject *gobject) {
  GUtilsSessionLockSurface *surface = GUTILS_SESSION_LOCK_SURFACE(gobject);

  if (surface->frame_callback) {
    wl_callback_destroy(surface->frame_callback);
    surface->frame_callback = NULL;
  }
  if (surface->cairo) {
    cairo_destroy(surface->cairo);
    surface->cairo = NULL;
  }
  if (surface->cairo_surface) {
    cairo_surface_destroy(surface->cairo_surface);
    surface->cairo_surface = NULL;
  }
  if (surface->buffer) {
    shm_buffer_destroy(surface->buffer);
    surface->buffer = NULL;
  }
  if (surface->lock_surface) {
    ext_session_lock_surface_v1_destroy(surface->lock_surface);
    surface->lock_surface = NULL;
  }
  if (surface->wl_surface) {
    wl_surface_destroy(surface->wl_surface);
    surface->wl_surface = NULL;
  }
  g_free(surface->output_name);

  G_OBJECT_CLASS(gutils_session_lock_surface_parent_class)->dispose(gobject);
}

static void
gutils_session_lock_surface_class_init(GUtilsSessionLockSurfaceClass *klass) {
  GObjectClass *object_class = G_OBJECT_CLASS(klass);
  object_class->dispose = gutils_session_lock_surface_dispose;

  surface_signals[SURFACE_KEY_PRESSED] = g_signal_new(
      "key-pressed", G_TYPE_FROM_CLASS(klass), G_SIGNAL_RUN_LAST, 0, NULL, NULL,
      NULL, G_TYPE_NONE, 3, G_TYPE_UINT, G_TYPE_UINT, G_TYPE_UINT);

  surface_signals[SURFACE_POINTER_MOTION] = g_signal_new(
      "pointer-motion", G_TYPE_FROM_CLASS(klass), G_SIGNAL_RUN_LAST, 0, NULL,
      NULL, NULL, G_TYPE_NONE, 2, G_TYPE_DOUBLE, G_TYPE_DOUBLE);

  surface_signals[SURFACE_POINTER_BUTTON] = g_signal_new(
      "pointer-button", G_TYPE_FROM_CLASS(klass), G_SIGNAL_RUN_LAST, 0, NULL,
      NULL, NULL, G_TYPE_NONE, 3, G_TYPE_UINT, G_TYPE_UINT, G_TYPE_UINT);

  surface_signals[SURFACE_CONFIGURE] =
      g_signal_new("frame-ready", G_TYPE_FROM_CLASS(klass), G_SIGNAL_RUN_LAST,
                   0, NULL, NULL, NULL, G_TYPE_NONE, 0);
}

/**
 * gutils_session_lock_surface_get_cairo_surface:
 * @surface: a #GUtilsSessionLockSurface
 *
 * Returns the Cairo image surface for rendering. The surface is created
 * (or recreated) when the compositor configures the lock surface with
 * new dimensions.
 *
 * Returns: (transfer none) (nullable): the #cairo_surface_t, or %NULL if
 * not yet configured
 */
cairo_surface_t *gutils_session_lock_surface_get_cairo_surface(
    GUtilsSessionLockSurface *surface) {
  g_return_val_if_fail(GUTILS_IS_SESSION_LOCK_SURFACE(surface), NULL);
  return surface->cairo_surface;
}

/**
 * gutils_session_lock_surface_get_cairo:
 * @surface: a #GUtilsSessionLockSurface
 *
 * Returns a Cairo context for rendering to the surface's pixel buffer.
 *
 * Returns: (transfer none) (nullable): the #cairo_t, or %NULL if the
 * surface has not been configured yet
 */
cairo_t *
gutils_session_lock_surface_get_cairo(GUtilsSessionLockSurface *surface) {
  g_return_val_if_fail(GUTILS_IS_SESSION_LOCK_SURFACE(surface), NULL);
  return surface->cairo;
}

/**
 * gutils_session_lock_surface_render:
 * @surface: a #GUtilsSessionLockSurface
 *
 * Commits the Cairo surface content to the Wayland surface and requests
 * a frame callback. Call this after drawing to have the compositor
 * present the buffer.
 */
void gutils_session_lock_surface_render(GUtilsSessionLockSurface *surface) {
  g_return_if_fail(GUTILS_IS_SESSION_LOCK_SURFACE(surface));
  if (!surface->wl_surface || !surface->buffer)
    return;

  cairo_surface_flush(surface->cairo_surface);
  wl_surface_attach(surface->wl_surface, surface->buffer->buffer, 0, 0);
  wl_surface_damage_buffer(surface->wl_surface, 0, 0, surface->width,
                           surface->height);

  if (surface->frame_callback)
    wl_callback_destroy(surface->frame_callback);
  surface->frame_callback = wl_surface_frame(surface->wl_surface);
  wl_callback_add_listener(surface->frame_callback, &frame_listener, surface);

  wl_surface_commit(surface->wl_surface);
}

/**
 * gutils_session_lock_surface_get_width:
 * @surface: a #GUtilsSessionLockSurface
 *
 * Returns: the surface width in pixels, or 0 if not yet configured
 */
int gutils_session_lock_surface_get_width(GUtilsSessionLockSurface *surface) {
  g_return_val_if_fail(GUTILS_IS_SESSION_LOCK_SURFACE(surface), 0);
  return surface->width;
}

/**
 * gutils_session_lock_surface_get_height:
 * @surface: a #GUtilsSessionLockSurface
 *
 * Returns: the surface height in pixels, or 0 if not yet configured
 */
int gutils_session_lock_surface_get_height(GUtilsSessionLockSurface *surface) {
  g_return_val_if_fail(GUTILS_IS_SESSION_LOCK_SURFACE(surface), 0);
  return surface->height;
}

/**
 * gutils_session_lock_surface_get_output_name:
 * @surface: a #GUtilsSessionLockSurface
 *
 * Returns: (transfer none) (nullable): the compositor-reported output
 * name (e.g. "DP-1"), or %NULL if not yet associated
 */
const char *
gutils_session_lock_surface_get_output_name(GUtilsSessionLockSurface *surface) {
  g_return_val_if_fail(GUTILS_IS_SESSION_LOCK_SURFACE(surface), NULL);
  return surface->output_name;
}

static void session_lock_surface_emit_key(GUtilsSessionLockSurface *surface,
                                          guint keyval, guint keycode,
                                          guint state) {
  g_return_if_fail(GUTILS_IS_SESSION_LOCK_SURFACE(surface));
  g_signal_emit(surface, surface_signals[SURFACE_KEY_PRESSED], 0, keyval,
                keycode, state);
}

struct _GUtilsSessionLock {
  GObject parent;

  struct wl_display *display;
  struct wl_registry *registry;
  struct wl_compositor *compositor;
  struct wl_shm *shm;
  struct wl_seat *seat;
  struct wl_keyboard *keyboard;
  struct wl_pointer *pointer;

  struct ext_session_lock_manager_v1 *lock_manager;
  struct ext_session_lock_v1 *lock;

  GList *output_infos; /* OutputInfo* - output + name pairs */
  GList *surfaces;     /* GUtilsSessionLockSurface* */

  struct xkb_context *xkb_context;
  struct xkb_keymap *xkb_keymap;
  struct xkb_state *xkb_state;

  gboolean locked;
  GUtilsSessionLockSurface *focused_surface;

  guint wayland_watch_id;
  GIOChannel *wayland_channel;
};

enum { SIGNAL_LOCKED, SIGNAL_FINISHED, SIGNAL_SURFACE_CREATED, N_SIGNALS };

static guint lock_signals[N_SIGNALS];

G_DEFINE_TYPE(GUtilsSessionLock, gutils_session_lock, G_TYPE_OBJECT)

static void output_geometry(void *data, struct wl_output *output, int32_t x,
                            int32_t y, int32_t pw, int32_t ph, int32_t subpixel,
                            const char *make, const char *model,
                            int32_t transform) {
  (void)data;
  (void)output;
  (void)x;
  (void)y;
  (void)pw;
  (void)ph;
  (void)subpixel;
  (void)make;
  (void)model;
  (void)transform;
}

static void output_mode(void *data, struct wl_output *output, uint32_t flags,
                        int32_t width, int32_t height, int32_t refresh) {
  (void)data;
  (void)output;
  (void)flags;
  (void)width;
  (void)height;
  (void)refresh;
}

static void output_done(void *data, struct wl_output *output) {
  (void)data;
  (void)output;
}

static void output_scale(void *data, struct wl_output *output, int32_t factor) {
  (void)data;
  (void)output;
  (void)factor;
}

static void output_name(void *data, struct wl_output *wl_output,
                        const char *name) {
  GUtilsSessionLock *lock = GUTILS_SESSION_LOCK(data);

  for (GList *l = lock->output_infos; l; l = l->next) {
    OutputInfo *info = l->data;
    if (info->output == wl_output) {
      g_free(info->name);
      info->name = g_strdup(name);
      return;
    }
  }

  OutputInfo *info = g_new0(OutputInfo, 1);
  info->output = wl_output;
  info->name = g_strdup(name);
  lock->output_infos = g_list_append(lock->output_infos, info);
}

static void output_description(void *data, struct wl_output *output,
                               const char *desc) {
  (void)data;
  (void)output;
  (void)desc;
}

static const struct wl_output_listener output_listener = {
    .geometry = output_geometry,
    .mode = output_mode,
    .done = output_done,
    .scale = output_scale,
    .name = output_name,
    .description = output_description,
};

static void wl_keyboard_keymap(void *data, struct wl_keyboard *keyboard,
                               uint32_t format, int32_t fd, uint32_t size) {
  GUtilsSessionLock *lock = GUTILS_SESSION_LOCK(data);

  if (format != WL_KEYBOARD_KEYMAP_FORMAT_XKB_V1) {
    close(fd);
    return;
  }

  char *map_str = mmap(NULL, size, PROT_READ, MAP_PRIVATE, fd, 0);
  if (map_str == MAP_FAILED) {
    close(fd);
    return;
  }

  if (lock->xkb_keymap)
    xkb_keymap_unref(lock->xkb_keymap);
  if (lock->xkb_state)
    xkb_state_unref(lock->xkb_state);

  lock->xkb_keymap = xkb_keymap_new_from_string(lock->xkb_context, map_str,
                                                XKB_KEYMAP_FORMAT_TEXT_V1,
                                                XKB_KEYMAP_COMPILE_NO_FLAGS);
  munmap(map_str, size);
  close(fd);

  if (lock->xkb_keymap)
    lock->xkb_state = xkb_state_new(lock->xkb_keymap);
}

static void wl_keyboard_enter(void *data, struct wl_keyboard *keyboard,
                              uint32_t serial, struct wl_surface *surface,
                              struct wl_array *keys) {
  GUtilsSessionLock *lock = GUTILS_SESSION_LOCK(data);
  (void)keyboard;
  (void)serial;
  (void)keys;

  for (GList *l = lock->surfaces; l; l = l->next) {
    GUtilsSessionLockSurface *s = GUTILS_SESSION_LOCK_SURFACE(l->data);
    if (s->wl_surface == surface) {
      lock->focused_surface = s;
      return;
    }
  }
}

static void wl_keyboard_leave(void *data, struct wl_keyboard *keyboard,
                              uint32_t serial, struct wl_surface *surface) {
  GUtilsSessionLock *lock = GUTILS_SESSION_LOCK(data);
  (void)keyboard;
  (void)serial;

  if (lock->focused_surface && lock->focused_surface->wl_surface == surface)
    lock->focused_surface = NULL;
}

static void wl_keyboard_key(void *data, struct wl_keyboard *keyboard,
                            uint32_t serial, uint32_t time, uint32_t key,
                            uint32_t state) {
  GUtilsSessionLock *lock = GUTILS_SESSION_LOCK(data);
  (void)keyboard;
  (void)serial;
  (void)time;

  if (!lock->focused_surface || !lock->xkb_state)
    return;

  xkb_keycode_t keycode = key + 8;
  xkb_keysym_t keysym = xkb_state_key_get_one_sym(lock->xkb_state, keycode);
  session_lock_surface_emit_key(lock->focused_surface, (guint)keysym,
                                (guint)keycode, state);
}

static void wl_keyboard_modifiers(void *data, struct wl_keyboard *keyboard,
                                  uint32_t serial, uint32_t mods_depressed,
                                  uint32_t mods_latched, uint32_t mods_locked,
                                  uint32_t group) {
  GUtilsSessionLock *lock = GUTILS_SESSION_LOCK(data);
  (void)keyboard;
  (void)serial;

  if (lock->xkb_state)
    xkb_state_update_mask(lock->xkb_state, mods_depressed, mods_latched,
                          mods_locked, 0, 0, group);
}

static void wl_keyboard_repeat_info(void *data, struct wl_keyboard *keyboard,
                                    int32_t rate, int32_t delay) {
  (void)data;
  (void)keyboard;
  (void)rate;
  (void)delay;
}

static const struct wl_keyboard_listener keyboard_listener = {
    .keymap = wl_keyboard_keymap,
    .enter = wl_keyboard_enter,
    .leave = wl_keyboard_leave,
    .key = wl_keyboard_key,
    .modifiers = wl_keyboard_modifiers,
    .repeat_info = wl_keyboard_repeat_info,
};

static void wl_pointer_enter(void *data, struct wl_pointer *pointer,
                             uint32_t serial, struct wl_surface *surface,
                             wl_fixed_t sx, wl_fixed_t sy) {
  (void)pointer;
  (void)serial;
  (void)surface;
  (void)sx;
  (void)sy;
}

static void wl_pointer_leave(void *data, struct wl_pointer *pointer,
                             uint32_t serial, struct wl_surface *surface) {
  (void)data;
  (void)pointer;
  (void)serial;
  (void)surface;
}

static void wl_pointer_motion(void *data, struct wl_pointer *pointer,
                              uint32_t time, wl_fixed_t sx, wl_fixed_t sy) {
  GUtilsSessionLock *lock = GUTILS_SESSION_LOCK(data);
  (void)pointer;
  (void)time;

  double x = wl_fixed_to_double(sx);
  double y = wl_fixed_to_double(sy);

  for (GList *l = lock->surfaces; l; l = l->next) {
    GUtilsSessionLockSurface *s = GUTILS_SESSION_LOCK_SURFACE(l->data);
    g_signal_emit(s, surface_signals[SURFACE_POINTER_MOTION], 0, x, y);
  }
}

static void wl_pointer_button(void *data, struct wl_pointer *pointer,
                              uint32_t serial, uint32_t time, uint32_t button,
                              uint32_t state) {
  GUtilsSessionLock *lock = GUTILS_SESSION_LOCK(data);
  (void)pointer;
  (void)time;

  for (GList *l = lock->surfaces; l; l = l->next) {
    GUtilsSessionLockSurface *s = GUTILS_SESSION_LOCK_SURFACE(l->data);
    g_signal_emit(s, surface_signals[SURFACE_POINTER_BUTTON], 0, button, state,
                  serial);
  }
}

static void wl_pointer_axis(void *data, struct wl_pointer *pointer,
                            uint32_t time, uint32_t axis, wl_fixed_t value) {
  (void)data;
  (void)pointer;
  (void)time;
  (void)axis;
  (void)value;
}

static const struct wl_pointer_listener pointer_listener = {
    .enter = wl_pointer_enter,
    .leave = wl_pointer_leave,
    .motion = wl_pointer_motion,
    .button = wl_pointer_button,
    .axis = wl_pointer_axis,
};

static void seat_capabilities(void *data, struct wl_seat *seat,
                              uint32_t capabilities) {
  GUtilsSessionLock *lock = GUTILS_SESSION_LOCK(data);

  if (capabilities & WL_SEAT_CAPABILITY_KEYBOARD) {
    if (lock->keyboard)
      wl_keyboard_release(lock->keyboard);
    lock->keyboard = wl_seat_get_keyboard(seat);
    wl_keyboard_add_listener(lock->keyboard, &keyboard_listener, lock);
  }

  if (capabilities & WL_SEAT_CAPABILITY_POINTER) {
    if (lock->pointer)
      wl_pointer_release(lock->pointer);
    lock->pointer = wl_seat_get_pointer(seat);
    wl_pointer_add_listener(lock->pointer, &pointer_listener, lock);
  }
}

static void seat_name(void *data, struct wl_seat *seat, const char *name) {
  (void)data;
  (void)seat;
  (void)name;
}

static const struct wl_seat_listener seat_listener = {
    .capabilities = seat_capabilities,
    .name = seat_name,
};

static void registry_global(void *data, struct wl_registry *registry,
                            uint32_t name, const char *interface,
                            uint32_t version) {
  GUtilsSessionLock *lock = GUTILS_SESSION_LOCK(data);

  if (strcmp(interface, wl_compositor_interface.name) == 0) {
    lock->compositor =
        wl_registry_bind(registry, name, &wl_compositor_interface, 4);
  } else if (strcmp(interface, wl_shm_interface.name) == 0) {
    lock->shm = wl_registry_bind(registry, name, &wl_shm_interface, 1);
  } else if (strcmp(interface, wl_seat_interface.name) == 0) {
    lock->seat = wl_registry_bind(registry, name, &wl_seat_interface, 7);
    wl_seat_add_listener(lock->seat, &seat_listener, lock);
  } else if (strcmp(interface, wl_output_interface.name) == 0) {
    struct wl_output *output =
        wl_registry_bind(registry, name, &wl_output_interface, 4);
    wl_output_add_listener(output, &output_listener, lock);
  } else if (strcmp(interface, ext_session_lock_manager_v1_interface.name) ==
             0) {
    lock->lock_manager = wl_registry_bind(
        registry, name, &ext_session_lock_manager_v1_interface, 1);
  }
}

static void registry_global_remove(void *data, struct wl_registry *registry,
                                   uint32_t name) {
  (void)data;
  (void)registry;
  (void)name;
}

static const struct wl_registry_listener registry_listener = {
    .global = registry_global,
    .global_remove = registry_global_remove,
};

static char *find_output_name(GUtilsSessionLock *lock,
                              struct wl_output *output) {
  for (GList *l = lock->output_infos; l; l = l->next) {
    OutputInfo *info = l->data;
    if (info->output == output)
      return info->name;
  }
  return NULL;
}

static void lock_locked(void *data, struct ext_session_lock_v1 *lock) {
  GUtilsSessionLock *slock = GUTILS_SESSION_LOCK(data);
  slock->locked = TRUE;

  for (GList *l = slock->output_infos; l; l = l->next) {
    OutputInfo *info = l->data;

    GUtilsSessionLockSurface *surface =
        g_object_new(GUTILS_TYPE_SESSION_LOCK_SURFACE, NULL);
    surface->wl_surface = wl_compositor_create_surface(slock->compositor);
    surface->wl_shm = slock->shm;
    surface->output_name = g_strdup(info->name ? info->name : "unknown");
    surface->lock_surface = ext_session_lock_v1_get_lock_surface(
        slock->lock, surface->wl_surface, info->output);
    ext_session_lock_surface_v1_add_listener(surface->lock_surface,
                                             &lock_surface_listener, surface);

    slock->surfaces = g_list_append(slock->surfaces, surface);
    g_signal_emit(slock, lock_signals[SIGNAL_SURFACE_CREATED], 0, surface);
  }

  g_signal_emit(slock, lock_signals[SIGNAL_LOCKED], 0);
}

static void lock_finished(void *data, struct ext_session_lock_v1 *lock) {
  GUtilsSessionLock *slock = GUTILS_SESSION_LOCK(data);
  slock->locked = FALSE;
  g_signal_emit(slock, lock_signals[SIGNAL_FINISHED], 0);
}

static const struct ext_session_lock_v1_listener lock_listener = {
    .locked = lock_locked,
    .finished = lock_finished,
};

static gboolean on_wayland_event(GIOChannel *channel, GIOCondition condition,
                                 gpointer data) {
  GUtilsSessionLock *lock = GUTILS_SESSION_LOCK(data);

  if (wl_display_prepare_read(lock->display) == 0) {
    wl_display_read_events(lock->display);
    wl_display_dispatch_pending(lock->display);
  } else {
    wl_display_dispatch_pending(lock->display);
  }

  if (lock->display)
    wl_display_flush(lock->display);

  return TRUE;
}

static void gutils_session_lock_init(GUtilsSessionLock *lock) {
  lock->xkb_context = xkb_context_new(XKB_CONTEXT_NO_FLAGS);
}

static void gutils_session_lock_dispose(GObject *gobject) {
  GUtilsSessionLock *lock = GUTILS_SESSION_LOCK(gobject);

  if (lock->wayland_watch_id > 0) {
    g_source_remove(lock->wayland_watch_id);
    lock->wayland_watch_id = 0;
  }
  if (lock->wayland_channel) {
    g_io_channel_unref(lock->wayland_channel);
    lock->wayland_channel = NULL;
  }

  g_list_free_full(lock->surfaces, g_object_unref);
  lock->surfaces = NULL;

  g_list_free_full(lock->output_infos, (GDestroyNotify)output_info_free);
  lock->output_infos = NULL;

  if (lock->lock) {
    ext_session_lock_v1_destroy(lock->lock);
    lock->lock = NULL;
  }
  if (lock->lock_manager) {
    ext_session_lock_manager_v1_destroy(lock->lock_manager);
    lock->lock_manager = NULL;
  }
  if (lock->keyboard) {
    wl_keyboard_release(lock->keyboard);
    lock->keyboard = NULL;
  }
  if (lock->pointer) {
    wl_pointer_release(lock->pointer);
    lock->pointer = NULL;
  }
  if (lock->seat) {
    wl_seat_release(lock->seat);
    lock->seat = NULL;
  }
  if (lock->xkb_state) {
    xkb_state_unref(lock->xkb_state);
    lock->xkb_state = NULL;
  }
  if (lock->xkb_keymap) {
    xkb_keymap_unref(lock->xkb_keymap);
    lock->xkb_keymap = NULL;
  }
  if (lock->xkb_context) {
    xkb_context_unref(lock->xkb_context);
    lock->xkb_context = NULL;
  }
  if (lock->compositor) {
    wl_compositor_destroy(lock->compositor);
    lock->compositor = NULL;
  }
  if (lock->shm) {
    wl_shm_destroy(lock->shm);
    lock->shm = NULL;
  }
  if (lock->registry) {
    wl_registry_destroy(lock->registry);
    lock->registry = NULL;
  }
  if (lock->display) {
    wl_display_disconnect(lock->display);
    lock->display = NULL;
  }

  G_OBJECT_CLASS(gutils_session_lock_parent_class)->dispose(gobject);
}

static void gutils_session_lock_class_init(GUtilsSessionLockClass *klass) {
  GObjectClass *object_class = G_OBJECT_CLASS(klass);
  object_class->dispose = gutils_session_lock_dispose;

  lock_signals[SIGNAL_LOCKED] =
      g_signal_new("locked", G_TYPE_FROM_CLASS(klass), G_SIGNAL_RUN_LAST, 0,
                   NULL, NULL, NULL, G_TYPE_NONE, 0);

  lock_signals[SIGNAL_FINISHED] =
      g_signal_new("finished", G_TYPE_FROM_CLASS(klass), G_SIGNAL_RUN_LAST, 0,
                   NULL, NULL, NULL, G_TYPE_NONE, 0);

  lock_signals[SIGNAL_SURFACE_CREATED] = g_signal_new(
      "surface-created", G_TYPE_FROM_CLASS(klass), G_SIGNAL_RUN_LAST, 0, NULL,
      NULL, NULL, G_TYPE_NONE, 1, GUTILS_TYPE_SESSION_LOCK_SURFACE);
}

/**
 * gutils_session_lock_lock:
 * @lock: a #GUtilsSessionLock
 * @error: (out) (optional): return location for a #GError, or %NULL
 *
 * Connects to the Wayland display, sets up GLib event loop integration,
 * and submits an ext-session-lock-v1 lock request to the compositor.
 *
 * On success the compositor will lock the session and emit the
 * #GUtilsSessionLock::locked signal, followed by ::surface-created for
 * each display output.
 *
 * Returns: %TRUE if the lock request was submitted successfully,
 * %FALSE if the compositor does not support ext-session-lock-v1 or
 * a Wayland protocol error occurred
 */
gboolean gutils_session_lock_lock(GUtilsSessionLock *lock, GError **error) {
  g_return_val_if_fail(GUTILS_IS_SESSION_LOCK(lock), FALSE);

  lock->display = wl_display_connect(NULL);
  if (!lock->display) {
    g_set_error(
        error, G_IO_ERROR, G_IO_ERROR_FAILED,
        "Failed to connect to Wayland display. Is WAYLAND_DISPLAY set?");
    return FALSE;
  }

  lock->wayland_channel =
      g_io_channel_unix_new(wl_display_get_fd(lock->display));
  lock->wayland_watch_id =
      g_io_add_watch(lock->wayland_channel, G_IO_IN, on_wayland_event, lock);

  lock->registry = wl_display_get_registry(lock->display);
  wl_registry_add_listener(lock->registry, &registry_listener, lock);
  wl_display_roundtrip(lock->display);

  if (!lock->lock_manager) {
    g_set_error(error, G_IO_ERROR, G_IO_ERROR_NOT_SUPPORTED,
                "ext_session_lock_manager_v1 not advertised by compositor. "
                "The compositor must support ext-session-lock-v1.");
    return FALSE;
  }

  if (!lock->compositor) {
    g_set_error(error, G_IO_ERROR, G_IO_ERROR_FAILED,
                "wl_compositor not available");
    return FALSE;
  }

  if (!lock->shm) {
    g_set_error(error, G_IO_ERROR, G_IO_ERROR_FAILED, "wl_shm not available");
    return FALSE;
  }

  lock->lock = ext_session_lock_manager_v1_lock(lock->lock_manager);
  ext_session_lock_v1_add_listener(lock->lock, &lock_listener, lock);

  wl_display_roundtrip(lock->display);

  return TRUE;
}

/**
 * gutils_session_lock_unlock_and_destroy:
 * @lock: a #GUtilsSessionLock
 *
 * Requests the compositor to unlock the session and destroy the lock
 * object. The #GUtilsSessionLock::finished signal is emitted once the
 * compositor confirms the unlock.
 */
void gutils_session_lock_unlock_and_destroy(GUtilsSessionLock *lock) {
  g_return_if_fail(GUTILS_IS_SESSION_LOCK(lock));
  if (lock->lock) {
    ext_session_lock_v1_unlock_and_destroy(lock->lock);
    lock->lock = NULL;
  }
}

/**
 * gutils_session_lock_get_locked:
 * @lock: a #GUtilsSessionLock
 *
 * Returns: %TRUE if the session is currently locked
 */
gboolean gutils_session_lock_get_locked(GUtilsSessionLock *lock) {
  g_return_val_if_fail(GUTILS_IS_SESSION_LOCK(lock), FALSE);
  return lock->locked;
}

/**
 * gutils_session_lock_get_surfaces:
 * @lock: a #GUtilsSessionLock
 *
 * Returns: (transfer container) (element-type GUtilsSessionLockSurface):
 * a newly allocated #GList of lock surfaces, one per output. Free with
 * g_list_free()
 */
GList *gutils_session_lock_get_surfaces(GUtilsSessionLock *lock) {
  g_return_val_if_fail(GUTILS_IS_SESSION_LOCK(lock), NULL);
  return g_list_copy(lock->surfaces);
}
