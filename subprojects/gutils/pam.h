#ifndef PAM_H
#define PAM_H

#include <gio/gio.h>
#include <glib-object.h>

#ifndef POLKIT_AGENT_I_KNOW_API_IS_SUBJECT_TO_CHANGE
#define POLKIT_AGENT_I_KNOW_API_IS_SUBJECT_TO_CHANGE
#endif

#include <polkitagent/polkitagent.h>

G_BEGIN_DECLS

void gutils_authenticate_user(const char *username, const char *password,
                              int io_priority, GCancellable *cancellable,
                              GAsyncReadyCallback callback, gpointer user_data);

void gutils_authenticate_user_for_service(const char *service,
                                          const char *username,
                                          const char *password, int io_priority,
                                          GCancellable *cancellable,
                                          GAsyncReadyCallback callback,
                                          gpointer user_data);

int gutils_authenticate_user_finish(GAsyncResult *res, GError **error);

void gutils_authenticate(const char *password, int io_priority,
                         GCancellable *cancellable,
                         GAsyncReadyCallback callback, gpointer user_data);

void gutils_authenticate_for_service(const char *service, const char *password,
                                     int io_priority, GCancellable *cancellable,
                                     GAsyncReadyCallback callback,
                                     gpointer user_data);

int gutils_authenticate_finish(GAsyncResult *res, GError **error);

#define GUTILS_TYPE_POLKIT_AGENT (gutils_polkit_agent_get_type())
G_DECLARE_FINAL_TYPE(GUtilsPolkitAgent, gutils_polkit_agent, GUTILS,
                     POLKIT_AGENT, PolkitAgentListener)

GUtilsPolkitAgent *gutils_polkit_agent_new(void);

gboolean
gutils_polkit_agent_register(GUtilsPolkitAgent *agent, const gchar *session_id,
                             const gchar *object_path, gboolean fallback,
                             GCancellable *cancellable, GError **error);

void gutils_polkit_agent_unregister(GUtilsPolkitAgent *agent);

gboolean gutils_polkit_agent_select_identity(GUtilsPolkitAgent *agent,
                                             guint index, GError **error);

gboolean gutils_polkit_agent_response(GUtilsPolkitAgent *agent,
                                      const gchar *response, GError **error);

void gutils_polkit_agent_cancel(GUtilsPolkitAgent *agent);

G_END_DECLS

#endif // !PAM_H
