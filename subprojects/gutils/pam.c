#include "pam.h"
#include <gio/gio.h>
#include <polkit/polkit.h>
#include <polkitagent/polkitagent.h>
#include <pwd.h>
#include <security/pam_appl.h>
#include <string.h>
#include <unistd.h>

typedef struct {
  gchar *service;
  gchar *username;
  gchar *password;
} auth_info;

void free_auth_info(void *data) {
  auth_info *info = (auth_info *)data;
  free(info->service);
  free(info->username);
  free(info->password);
  free(info);
}

int handle_conversation(int num_msg, const struct pam_message **msg,
                        struct pam_response **resp, void *appdata_ptr) {
  struct pam_response *replies = NULL;
  if (num_msg <= 0 || num_msg > PAM_MAX_NUM_MSG) {
    return PAM_CONV_ERR;
  }
  replies = (struct pam_response *)calloc(num_msg, sizeof(struct pam_response));
  if (replies == NULL) {
    return PAM_BUF_ERR;
  }
  for (int i = 0; i < num_msg; ++i) {
    switch (msg[i]->msg_style) {
    case PAM_PROMPT_ECHO_OFF:
    case PAM_PROMPT_ECHO_ON:
      replies[i].resp = strdup((const char *)appdata_ptr);
      if (replies[i].resp == NULL) {
        return PAM_ABORT;
      }
      break;
    case PAM_ERROR_MSG:
    case PAM_TEXT_INFO:
      break;
    }
  }
  *resp = replies;
  return PAM_SUCCESS;
}

void auth_thread(GTask *task, gpointer object, gpointer task_data,
                 GCancellable *cancellable) {
  (void)object;
  (void)cancellable;
  auth_info *info = (auth_info *)task_data;

  pam_handle_t *pamh = NULL;
  const struct pam_conv conv = {
      .conv = handle_conversation,
      .appdata_ptr = (void *)info->password,
  };
  int retval;
  retval = pam_start(info->service, info->username, &conv, &pamh);
  if (retval == PAM_SUCCESS) {
    retval = pam_authenticate(pamh, 0);
    pam_end(pamh, retval);
  }
  if (retval != PAM_SUCCESS) {
    g_task_return_new_error(task, G_IO_ERROR, G_IO_ERROR_FAILED, "%s",
                            pam_strerror(pamh, retval));
  } else {
    g_task_return_int(task, retval);
  }
}

/**
 * gutils_authenticate_user:
 * @username: the username for which the password to be authenticated
 * @password: the password to be authenticated
 * @io_priority: the [I/O priority][io-priority] of the request
 * @cancellable: (nullable): optional #GCancellable object,
 *   %NULL to ignore
 * @callback: (scope async) (closure user_data): a #GAsyncReadyCallback
 *   to call when the request is satisfied
 * @user_data: the data to pass to callback function
 *
 * Requests authentication of the provided password for the specified username
 * using the PAM (Pluggable Authentication Modules) system.
 */
void gutils_authenticate_user_for_service(
    const gchar *service, const gchar *username, const gchar *password,
    int io_priority, GCancellable *cancellable, GAsyncReadyCallback callback,
    gpointer user_data) {
  auth_info *info = (auth_info *)malloc(sizeof(auth_info));
  if (info == NULL)
    return;
  info->service = strdup(service);
  info->username = strdup(username);
  info->password = strdup(password);

  GTask *task;
  task = g_task_new(NULL, cancellable, callback, user_data);
  g_task_set_task_data(task, info, free_auth_info);
  g_task_set_priority(task, io_priority);
  g_task_run_in_thread(task, auth_thread);
  g_object_unref(task);
}

void gutils_authenticate_user(const gchar *username, const gchar *password,
                              int io_priority, GCancellable *cancellable,
                              GAsyncReadyCallback callback,
                              gpointer user_data) {
  return gutils_authenticate_user_for_service(
      "ags", username, password, io_priority, cancellable, callback, user_data);
}

int gutils_authenticate_user_finish(GAsyncResult *res, GError **error) {
  return g_task_propagate_int(G_TASK(res), error);
}

/**
 * gutils_authenticate:
 * @password: the password to be authenticated
 * @io_priority: the [I/O priority][io-priority] of the request
 * @cancellable: (nullable): optional #GCancellable object,
 *   %NULL to ignore
 * @callback: (scope async) (closure user_data): a #GAsyncReadyCallback
 *   to call when the request is satisfied
 * @user_data: the data to pass to callback function
 *
 * Requests authentication of the provided password using the PAM (Pluggable
 * Authentication Modules) system.
 */
void gutils_authenticate_for_service(const gchar *service,
                                     const gchar *password, int io_priority,
                                     GCancellable *cancellable,
                                     GAsyncReadyCallback callback,
                                     gpointer user_data) {
  struct passwd *passwd = getpwuid(getuid());
  char *username = passwd->pw_name;

  return gutils_authenticate_user_for_service(service, username, password,
                                              io_priority, cancellable,
                                              callback, user_data);
}

void gutils_authenticate(const gchar *password, int io_priority,
                         GCancellable *cancellable,
                         GAsyncReadyCallback callback, gpointer user_data) {
  return gutils_authenticate_for_service("ags", password, io_priority,
                                         cancellable, callback, user_data);
}

int gutils_authenticate_finish(GAsyncResult *res, GError **error) {
  return g_task_propagate_int(G_TASK(res), error);
}

typedef struct {
  gpointer registration_handle;
  PolkitSubject *subject;

  gchar *cookie;
  GList *identities;
  PolkitAgentSession *session;
  GTask *task;
  GCancellable *cancellable;
  gulong cancellable_id;
  gboolean completed;
} GUtilsPolkitAgentPrivate;

struct _GUtilsPolkitAgent {
  PolkitAgentListener parent_instance;
};

G_DEFINE_TYPE_WITH_PRIVATE(GUtilsPolkitAgent, gutils_polkit_agent,
                           POLKIT_AGENT_TYPE_LISTENER)

enum {
  BEGIN,
  REQUEST,
  SHOW_INFO,
  SHOW_ERROR,
  COMPLETED,
  CANCELLED,
  LAST_SIGNAL,
};

static guint polkit_agent_signals[LAST_SIGNAL];

static GVariant *details_to_variant(PolkitDetails *details) {
  GVariantBuilder builder;
  g_variant_builder_init(&builder, G_VARIANT_TYPE("a{ss}"));

  if (details != NULL) {
    gchar **keys = polkit_details_get_keys(details);
    if (keys != NULL) {
      for (gchar **key = keys; *key != NULL; key++) {
        const gchar *value = polkit_details_lookup(details, *key);
        if (value != NULL) {
          g_variant_builder_add(&builder, "{ss}", *key, value);
        }
      }
      g_strfreev(keys);
    }
  }

  return g_variant_ref_sink(g_variant_builder_end(&builder));
}

static GVariant *identities_to_variant(GList *identities) {
  GVariantBuilder builder;
  g_variant_builder_init(&builder, G_VARIANT_TYPE("aa{sv}"));

  for (GList *l = identities; l != NULL; l = l->next) {
    PolkitIdentity *identity = POLKIT_IDENTITY(l->data);
    g_autofree gchar *identity_string = polkit_identity_to_string(identity);
    GVariantBuilder item;
    g_variant_builder_init(&item, G_VARIANT_TYPE("a{sv}"));

    g_variant_builder_add(&item, "{sv}", "kind",
                          g_variant_new_string(G_OBJECT_TYPE_NAME(identity)));
    g_variant_builder_add(&item, "{sv}", "id",
                          g_variant_new_string(identity_string));

    if (POLKIT_IS_UNIX_USER(identity)) {
      PolkitUnixUser *user = POLKIT_UNIX_USER(identity);
      const gchar *name = polkit_unix_user_get_name(user);
      g_variant_builder_add(
          &item, "{sv}", "uid",
          g_variant_new_int32(polkit_unix_user_get_uid(user)));
      if (name != NULL) {
        g_variant_builder_add(&item, "{sv}", "name",
                              g_variant_new_string(name));
      }
    } else if (POLKIT_IS_UNIX_GROUP(identity)) {
      PolkitUnixGroup *group = POLKIT_UNIX_GROUP(identity);
      g_variant_builder_add(
          &item, "{sv}", "gid",
          g_variant_new_int32(polkit_unix_group_get_gid(group)));
    }

    g_variant_builder_add(&builder, "a{sv}", &item);
  }

  return g_variant_ref_sink(g_variant_builder_end(&builder));
}

static gpointer copy_identity(gconstpointer identity, gpointer user_data) {
  (void)user_data;
  return g_object_ref((gpointer)identity);
}

static void clear_authentication(GUtilsPolkitAgent *agent) {
  GUtilsPolkitAgentPrivate *priv =
      gutils_polkit_agent_get_instance_private(agent);

  if (priv->cancellable != NULL && priv->cancellable_id != 0) {
    g_cancellable_disconnect(priv->cancellable, priv->cancellable_id);
    priv->cancellable_id = 0;
  }

  g_clear_object(&priv->cancellable);
  g_clear_object(&priv->session);
  g_clear_object(&priv->task);
  g_clear_pointer(&priv->cookie, g_free);
  g_clear_list(&priv->identities, g_object_unref);
  priv->completed = FALSE;
}

static void finish_authentication(GUtilsPolkitAgent *agent, gboolean authorized,
                                  gboolean cancelled) {
  GUtilsPolkitAgentPrivate *priv =
      gutils_polkit_agent_get_instance_private(agent);

  if (priv->completed) {
    return;
  }
  priv->completed = TRUE;

  if (priv->task != NULL) {
    if (authorized) {
      g_task_return_boolean(priv->task, TRUE);
    } else if (cancelled) {
      g_task_return_new_error(priv->task, G_IO_ERROR, G_IO_ERROR_CANCELLED,
                              "Authentication was cancelled");
    } else {
      g_task_return_new_error(priv->task, G_IO_ERROR,
                              G_IO_ERROR_PERMISSION_DENIED,
                              "Authentication failed");
    }
  }

  g_signal_emit(agent, polkit_agent_signals[COMPLETED], 0, authorized);
  clear_authentication(agent);
}

static void on_agent_session_request(PolkitAgentSession *session,
                                     const gchar *request, gboolean echo_on,
                                     gpointer user_data) {
  (void)session;
  g_signal_emit(user_data, polkit_agent_signals[REQUEST], 0, request, echo_on);
}

static void on_agent_session_show_info(PolkitAgentSession *session,
                                       const gchar *text, gpointer user_data) {
  (void)session;
  g_signal_emit(user_data, polkit_agent_signals[SHOW_INFO], 0, text);
}

static void on_agent_session_show_error(PolkitAgentSession *session,
                                        const gchar *text, gpointer user_data) {
  (void)session;
  g_signal_emit(user_data, polkit_agent_signals[SHOW_ERROR], 0, text);
}

static void on_agent_session_completed(PolkitAgentSession *session,
                                       gboolean gained_authorization,
                                       gpointer user_data) {
  (void)session;
  finish_authentication(GUTILS_POLKIT_AGENT(user_data), gained_authorization,
                        FALSE);
}

static void on_authentication_cancelled(GCancellable *cancellable,
                                        gpointer user_data) {
  (void)cancellable;
  GUtilsPolkitAgent *agent = GUTILS_POLKIT_AGENT(user_data);
  GUtilsPolkitAgentPrivate *priv =
      gutils_polkit_agent_get_instance_private(agent);

  if (priv->session != NULL) {
    polkit_agent_session_cancel(priv->session);
  }
  g_signal_emit(agent, polkit_agent_signals[CANCELLED], 0);
  finish_authentication(agent, FALSE, TRUE);
}

static void gutils_polkit_agent_initiate_authentication(
    PolkitAgentListener *listener, const gchar *action_id, const gchar *message,
    const gchar *icon_name, PolkitDetails *details, const gchar *cookie,
    GList *identities, GCancellable *cancellable, GAsyncReadyCallback callback,
    gpointer user_data) {
  GUtilsPolkitAgent *agent = GUTILS_POLKIT_AGENT(listener);
  GUtilsPolkitAgentPrivate *priv =
      gutils_polkit_agent_get_instance_private(agent);

  if (priv->task != NULL) {
    g_autoptr(GTask) task =
        g_task_new(listener, cancellable, callback, user_data);
    g_task_return_new_error(task, G_IO_ERROR, G_IO_ERROR_BUSY,
                            "Another authentication request is already active");
    return;
  }

  priv->task = g_task_new(listener, cancellable, callback, user_data);
  priv->cookie = g_strdup(cookie);
  priv->identities = g_list_copy_deep(identities, copy_identity, NULL);
  if (cancellable != NULL) {
    priv->cancellable = g_object_ref(cancellable);
    priv->cancellable_id = g_cancellable_connect(
        cancellable, G_CALLBACK(on_authentication_cancelled), agent, NULL);
  }

  g_autoptr(GVariant) details_variant = details_to_variant(details);
  g_autoptr(GVariant) identities_variant = identities_to_variant(identities);
  g_signal_emit(agent, polkit_agent_signals[BEGIN], 0, action_id, message,
                icon_name != NULL ? icon_name : "", details_variant,
                identities_variant);
}

static gboolean gutils_polkit_agent_initiate_authentication_finish(
    PolkitAgentListener *listener, GAsyncResult *res, GError **error) {
  (void)listener;
  return g_task_propagate_boolean(G_TASK(res), error);
}

GUtilsPolkitAgent *gutils_polkit_agent_new(void) {
  return g_object_new(GUTILS_TYPE_POLKIT_AGENT, NULL);
}

gboolean
gutils_polkit_agent_register(GUtilsPolkitAgent *agent, const gchar *session_id,
                             const gchar *object_path, gboolean fallback,
                             GCancellable *cancellable, GError **error) {
  GUtilsPolkitAgentPrivate *priv;
  g_autoptr(PolkitSubject) subject = NULL;

  g_return_val_if_fail(GUTILS_IS_POLKIT_AGENT(agent), FALSE);

  priv = gutils_polkit_agent_get_instance_private(agent);
  if (priv->registration_handle != NULL) {
    return TRUE;
  }

  if (session_id != NULL && *session_id != '\0') {
    subject = polkit_unix_session_new(session_id);
  } else {
    subject =
        polkit_unix_session_new_for_process_sync(getpid(), cancellable, error);
  }

  if (subject == NULL) {
    return FALSE;
  }

  if (fallback) {
    g_autoptr(GVariant) options =
        g_variant_ref_sink(g_variant_new_parsed("{ 'fallback': <%b> }", TRUE));
    priv->registration_handle = polkit_agent_listener_register_with_options(
        POLKIT_AGENT_LISTENER(agent), POLKIT_AGENT_REGISTER_FLAGS_NONE, subject,
        object_path, options, cancellable, error);
  } else {
    priv->registration_handle = polkit_agent_listener_register(
        POLKIT_AGENT_LISTENER(agent), POLKIT_AGENT_REGISTER_FLAGS_NONE, subject,
        object_path, cancellable, error);
  }

  if (priv->registration_handle == NULL) {
    return FALSE;
  }

  priv->subject = g_object_ref(subject);
  return TRUE;
}

void gutils_polkit_agent_unregister(GUtilsPolkitAgent *agent) {
  GUtilsPolkitAgentPrivate *priv;

  g_return_if_fail(GUTILS_IS_POLKIT_AGENT(agent));

  priv = gutils_polkit_agent_get_instance_private(agent);
  if (priv->registration_handle != NULL) {
    polkit_agent_listener_unregister(priv->registration_handle);
    priv->registration_handle = NULL;
  }

  clear_authentication(agent);
  g_clear_object(&priv->subject);
}

gboolean gutils_polkit_agent_select_identity(GUtilsPolkitAgent *agent,
                                             guint index, GError **error) {
  GUtilsPolkitAgentPrivate *priv;
  PolkitIdentity *identity;

  g_return_val_if_fail(GUTILS_IS_POLKIT_AGENT(agent), FALSE);

  priv = gutils_polkit_agent_get_instance_private(agent);
  if (priv->task == NULL || priv->cookie == NULL) {
    g_set_error(error, G_IO_ERROR, G_IO_ERROR_FAILED,
                "No active authentication request");
    return FALSE;
  }
  if (priv->session != NULL) {
    return TRUE;
  }

  identity = g_list_nth_data(priv->identities, index);
  if (identity == NULL) {
    g_set_error(error, G_IO_ERROR, G_IO_ERROR_INVALID_ARGUMENT,
                "Identity index is out of range");
    return FALSE;
  }

  priv->session = polkit_agent_session_new(identity, priv->cookie);
  g_signal_connect(priv->session, "request",
                   G_CALLBACK(on_agent_session_request), agent);
  g_signal_connect(priv->session, "show-info",
                   G_CALLBACK(on_agent_session_show_info), agent);
  g_signal_connect(priv->session, "show-error",
                   G_CALLBACK(on_agent_session_show_error), agent);
  g_signal_connect(priv->session, "completed",
                   G_CALLBACK(on_agent_session_completed), agent);
  polkit_agent_session_initiate(priv->session);

  return TRUE;
}

gboolean gutils_polkit_agent_response(GUtilsPolkitAgent *agent,
                                      const gchar *response, GError **error) {
  GUtilsPolkitAgentPrivate *priv;

  g_return_val_if_fail(GUTILS_IS_POLKIT_AGENT(agent), FALSE);

  priv = gutils_polkit_agent_get_instance_private(agent);
  if (priv->session == NULL) {
    g_set_error(error, G_IO_ERROR, G_IO_ERROR_FAILED,
                "No active authentication session");
    return FALSE;
  }

  polkit_agent_session_response(priv->session, response);
  return TRUE;
}

void gutils_polkit_agent_cancel(GUtilsPolkitAgent *agent) {
  GUtilsPolkitAgentPrivate *priv;

  g_return_if_fail(GUTILS_IS_POLKIT_AGENT(agent));

  priv = gutils_polkit_agent_get_instance_private(agent);
  if (priv->task == NULL) {
    return;
  }

  g_signal_emit(agent, polkit_agent_signals[CANCELLED], 0);
  if (priv->session != NULL) {
    polkit_agent_session_cancel(priv->session);
    finish_authentication(agent, FALSE, TRUE);
  } else {
    finish_authentication(agent, FALSE, TRUE);
  }
}

static void gutils_polkit_agent_dispose(GObject *object) {
  gutils_polkit_agent_unregister(GUTILS_POLKIT_AGENT(object));
  G_OBJECT_CLASS(gutils_polkit_agent_parent_class)->dispose(object);
}

static void gutils_polkit_agent_class_init(GUtilsPolkitAgentClass *klass) {
  GObjectClass *object_class = G_OBJECT_CLASS(klass);
  PolkitAgentListenerClass *listener_class = POLKIT_AGENT_LISTENER_CLASS(klass);

  object_class->dispose = gutils_polkit_agent_dispose;
  listener_class->initiate_authentication =
      gutils_polkit_agent_initiate_authentication;
  listener_class->initiate_authentication_finish =
      gutils_polkit_agent_initiate_authentication_finish;

  polkit_agent_signals[BEGIN] = g_signal_new(
      "begin", G_TYPE_FROM_CLASS(klass), G_SIGNAL_RUN_LAST, 0, NULL, NULL, NULL,
      G_TYPE_NONE, 5, G_TYPE_STRING, G_TYPE_STRING, G_TYPE_STRING,
      G_TYPE_VARIANT, G_TYPE_VARIANT);
  polkit_agent_signals[REQUEST] = g_signal_new(
      "request", G_TYPE_FROM_CLASS(klass), G_SIGNAL_RUN_LAST, 0, NULL, NULL,
      NULL, G_TYPE_NONE, 2, G_TYPE_STRING, G_TYPE_BOOLEAN);
  polkit_agent_signals[SHOW_INFO] =
      g_signal_new("show-info", G_TYPE_FROM_CLASS(klass), G_SIGNAL_RUN_LAST, 0,
                   NULL, NULL, NULL, G_TYPE_NONE, 1, G_TYPE_STRING);
  polkit_agent_signals[SHOW_ERROR] =
      g_signal_new("show-error", G_TYPE_FROM_CLASS(klass), G_SIGNAL_RUN_LAST, 0,
                   NULL, NULL, NULL, G_TYPE_NONE, 1, G_TYPE_STRING);
  polkit_agent_signals[COMPLETED] =
      g_signal_new("completed", G_TYPE_FROM_CLASS(klass), G_SIGNAL_RUN_LAST, 0,
                   NULL, NULL, NULL, G_TYPE_NONE, 1, G_TYPE_BOOLEAN);
  polkit_agent_signals[CANCELLED] =
      g_signal_new("cancelled", G_TYPE_FROM_CLASS(klass), G_SIGNAL_RUN_LAST, 0,
                   NULL, NULL, NULL, G_TYPE_NONE, 0);
}

static void gutils_polkit_agent_init(GUtilsPolkitAgent *agent) { (void)agent; }
