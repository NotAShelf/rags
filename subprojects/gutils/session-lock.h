#ifndef SESSION_LOCK_H
#define SESSION_LOCK_H

#include <cairo.h>
#include <gio/gio.h>
#include <glib-object.h>

G_BEGIN_DECLS

#define GUTILS_TYPE_SESSION_LOCK (gutils_session_lock_get_type())
G_DECLARE_FINAL_TYPE(GUtilsSessionLock, gutils_session_lock, GUTILS,
                     SESSION_LOCK, GObject)

#define GUTILS_TYPE_SESSION_LOCK_SURFACE                                       \
  (gutils_session_lock_surface_get_type())
G_DECLARE_FINAL_TYPE(GUtilsSessionLockSurface, gutils_session_lock_surface,
                     GUTILS, SESSION_LOCK_SURFACE, GObject)

gboolean gutils_session_lock_lock(GUtilsSessionLock *lock, GError **error);
void gutils_session_lock_unlock_and_destroy(GUtilsSessionLock *lock);
gboolean gutils_session_lock_get_locked(GUtilsSessionLock *lock);
GList *gutils_session_lock_get_surfaces(GUtilsSessionLock *lock);

cairo_surface_t *gutils_session_lock_surface_get_cairo_surface(
    GUtilsSessionLockSurface *surface);
cairo_t *
gutils_session_lock_surface_get_cairo(GUtilsSessionLockSurface *surface);
void gutils_session_lock_surface_render(GUtilsSessionLockSurface *surface);
int gutils_session_lock_surface_get_width(GUtilsSessionLockSurface *surface);
int gutils_session_lock_surface_get_height(GUtilsSessionLockSurface *surface);
const char *
gutils_session_lock_surface_get_output_name(GUtilsSessionLockSurface *surface);

G_END_DECLS

#endif
