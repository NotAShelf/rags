#include <errno.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>

#include <gio/gio.h>
#include <glib.h>

#include "config.h"

static const gchar *bin_name(void) {
  const gchar *p = strrchr(APP_ID, '.');
  return p ? p + 1 : APP_ID;
}

static gchar *make_app_bus(const gchar *name) {
  return g_strdup_printf("%s.%s", APP_ID, name);
}

static gchar *bus_to_path(const gchar *bus) {
  gchar *path = g_strdup_printf("/%s", bus);
  for (gchar *p = path + 1; *p; p++)
    if (*p == '.')
      *p = '/';
  return path;
}

static gboolean is_running(GDBusConnection *conn, const gchar *bus_name) {
  GError *err = NULL;
  GVariant *result = g_dbus_connection_call_sync(
      conn, "org.freedesktop.DBus", "/org/freedesktop/DBus",
      "org.freedesktop.DBus", "NameHasOwner", g_variant_new("(s)", bus_name),
      G_VARIANT_TYPE("(b)"), G_DBUS_CALL_FLAGS_NONE, -1, NULL, &err);

  if (!result) {
    g_printerr("DBus NameHasOwner: %s\n", err->message);
    g_error_free(err);
    return FALSE;
  }

  gboolean running = FALSE;
  g_variant_get(result, "(b)", &running);
  g_variant_unref(result);
  return running;
}

static void do_clear_cache(void) {
  gchar *cache = g_build_filename(g_get_user_cache_dir(), bin_name(), NULL);
  GFile *f = g_file_new_for_path(cache);
  GError *err = NULL;

  if (!g_file_trash(f, NULL, &err)) {
    if (!g_error_matches(err, G_IO_ERROR, G_IO_ERROR_NOT_FOUND))
      g_printerr("Failed to clear cache: %s\n", err->message);
    g_error_free(err);
  }

  g_object_unref(f);
  g_free(cache);
}

static void copy_if_missing(const gchar *src, const gchar *dest) {
  if (g_file_test(dest, G_FILE_TEST_EXISTS))
    return;

  gchar *contents = NULL;
  gsize length = 0;
  GError *err = NULL;

  if (!g_file_get_contents(src, &contents, &length, &err)) {
    g_printerr("Failed to read %s: %s\n", src, err->message);
    g_error_free(err);
    return;
  }

  if (!g_file_set_contents(dest, contents, (gssize)length, &err)) {
    g_printerr("Failed to write %s: %s\n", dest, err->message);
    g_error_free(err);
  }

  g_free(contents);
}

static void do_init(const gchar *config_dir, const gchar *config_path) {
  if (g_mkdir_with_parents(config_dir, 0755) < 0) {
    g_printerr("Failed to create config dir: %s\n", g_strerror(errno));
    return;
  }

  copy_if_missing(PKGDATADIR "/init/config.js", config_path);

  gchar *tsconfig = g_build_filename(config_dir, "tsconfig.json", NULL);
  copy_if_missing(PKGDATADIR "/init/tsconfig.json", tsconfig);
  g_free(tsconfig);

  const gchar *home = g_get_home_dir();
  const gchar *link_nix_store = g_getenv("AGS_LINK_NIX_STORE");
  gchar *types_path = NULL;

  if (!link_nix_store || *link_nix_store == '\0') {
    gchar *bases[] = {
        g_build_filename(home, ".local", NULL),
        g_build_filename(home, ".nix-profile", NULL),
        g_build_filename(home, ".local", "state", "nix", "profiles",
                         "home-manager", NULL),
        g_strdup("/run/current-system/sw"),
    };

    for (int i = 0; i < 4 && !types_path; i++) {
      gchar *candidate =
          g_build_filename(bases[i], "share", APP_ID, "types", NULL);
      if (g_file_test(candidate, G_FILE_TEST_EXISTS))
        types_path = candidate;
      else
        g_free(candidate);
    }

    for (int i = 0; i < 4; i++)
      g_free(bases[i]);
  }

  if (!types_path)
    types_path = g_build_filename(PKGDATADIR, "types", NULL);

  gchar *link_dest = g_build_filename(config_dir, "types", NULL);
  unlink(link_dest);
  if (symlink(types_path, link_dest) < 0 && errno != EEXIST)
    g_printerr("Failed to symlink types: %s\n", g_strerror(errno));

  gchar *tmpl_path = g_build_filename(PKGDATADIR, "init", "README.md.in", NULL);
  gchar *tmpl = NULL;
  GError *err = NULL;

  if (!g_file_get_contents(tmpl_path, &tmpl, NULL, &err)) {
    g_printerr("Failed to read README template: %s\n", err->message);
    g_error_free(err);
    err = NULL;
  }

  if (tmpl) {
    gchar **parts = g_strsplit(tmpl, "@TYPES_PATH@", 2);
    gchar *readme_content = g_strconcat(parts[0], types_path, parts[1], NULL);
    g_strfreev(parts);
    gchar *readme = g_build_filename(config_dir, "README.md", NULL);

    if (!g_file_set_contents(readme, readme_content, -1, &err)) {
      g_printerr("Failed to write README: %s\n", err->message);
      g_error_free(err);
    }

    g_free(readme_content);
    g_free(readme);
    g_free(tmpl);
  }

  g_free(tmpl_path);
  g_print("config directory setup at \"%s\"\n", config_dir);
  g_free(link_dest);
  g_free(types_path);
}

static GDBusProxy *make_proxy(GDBusConnection *conn, const gchar *app_bus,
                              const gchar *app_path) {
  GError *err = NULL;
  GDBusProxy *proxy =
      g_dbus_proxy_new_sync(conn, G_DBUS_PROXY_FLAGS_NONE, NULL, app_bus,
                            app_path, app_bus, NULL, &err);

  if (!proxy) {
    g_printerr("Failed to create proxy: %s\n", err->message);
    g_error_free(err);
  }
  return proxy;
}

static void proxy_call_void(GDBusProxy *proxy, const gchar *method,
                            GVariant *params) {
  GError *err = NULL;
  GVariant *ret = g_dbus_proxy_call_sync(
      proxy, method, params, G_DBUS_CALL_FLAGS_NONE, -1, NULL, &err);
  if (err) {
    g_printerr("%s: %s\n", method, err->message);
    g_error_free(err);
    return;
  }
  if (ret)
    g_variant_unref(ret);
}

static void do_toggle_window(GDBusProxy *proxy, const gchar *window) {
  GError *err = NULL;
  GVariant *ret = g_dbus_proxy_call_sync(
      proxy, "ToggleWindow", g_variant_new("(s)", window),
      G_DBUS_CALL_FLAGS_NONE, -1, NULL, &err);

  if (err) {
    g_printerr("ToggleWindow: %s\n", err->message);
    g_error_free(err);
    return;
  }
  if (ret) {
    const gchar *state = NULL;
    g_variant_get(ret, "(&s)", &state);
    if (state)
      g_print("%s\n", state);
    g_variant_unref(ret);
  }
}

typedef struct {
  GMainLoop *loop;
} ClientCtx;

static void client_method_call(GDBusConnection *conn, const gchar *sender,
                               const gchar *object_path,
                               const gchar *interface_name,
                               const gchar *method_name, GVariant *parameters,
                               GDBusMethodInvocation *invocation,
                               gpointer user_data) {
  (void)conn;
  (void)sender;
  (void)object_path;
  (void)interface_name;

  ClientCtx *ctx = user_data;
  const gchar *str = NULL;
  g_variant_get(parameters, "(&s)", &str);
  if (str)
    g_print("%s\n", str);
  g_dbus_method_invocation_return_value(invocation, NULL);
  if (g_strcmp0(method_name, "Return") == 0)
    g_main_loop_quit(ctx->loop);
}

static const GDBusInterfaceVTable client_vtable = {
    .method_call = client_method_call,
    .get_property = NULL,
    .set_property = NULL,
};

static int do_run_js(GDBusConnection *conn, const gchar *app_bus,
                     const gchar *app_path, const gchar *js_code) {
  gint64 ts = g_get_real_time() / G_USEC_PER_SEC;
  gchar *client_bus =
      g_strdup_printf("%s.client%" G_GINT64_FORMAT, app_bus, ts);
  gchar *client_path =
      g_strdup_printf("%s/client%" G_GINT64_FORMAT, app_path, ts);

  gchar *xml = g_strdup_printf("<node>"
                               "<interface name=\"%s\">"
                               "<method name=\"Return\"><arg direction=\"in\" "
                               "type=\"s\" name=\"string\"/></method>"
                               "<method name=\"Print\"><arg direction=\"in\" "
                               "type=\"s\" name=\"string\"/></method>"
                               "</interface>"
                               "</node>",
                               client_bus);

  GError *err = NULL;
  GDBusNodeInfo *node = g_dbus_node_info_new_for_xml(xml, &err);
  g_free(xml);

  if (!node) {
    g_printerr("Failed to parse client interface: %s\n", err->message);
    g_error_free(err);
    g_free(client_bus);
    g_free(client_path);
    return 1;
  }

  GMainLoop *loop = g_main_loop_new(NULL, FALSE);
  ClientCtx ctx = {.loop = loop};

  guint reg_id = g_dbus_connection_register_object(
      conn, client_path, node->interfaces[0], &client_vtable, &ctx, NULL, &err);

  if (!reg_id) {
    g_printerr("Failed to register client object: %s\n", err->message);
    g_error_free(err);
    g_dbus_node_info_unref(node);
    g_main_loop_unref(loop);
    g_free(client_bus);
    g_free(client_path);
    return 1;
  }

  GVariant *name_reply = g_dbus_connection_call_sync(
      conn, "org.freedesktop.DBus", "/org/freedesktop/DBus",
      "org.freedesktop.DBus", "RequestName",
      g_variant_new("(su)", client_bus, (guint32)0), G_VARIANT_TYPE("(u)"),
      G_DBUS_CALL_FLAGS_NONE, -1, NULL, &err);

  if (!name_reply) {
    g_printerr("RequestName: %s\n", err->message);
    g_error_free(err);
    g_dbus_connection_unregister_object(conn, reg_id);
    g_dbus_node_info_unref(node);
    g_main_loop_unref(loop);
    g_free(client_bus);
    g_free(client_path);
    return 1;
  }
  g_variant_unref(name_reply);

  g_dbus_connection_call(
      conn, app_bus, app_path, app_bus, "RunJs",
      g_variant_new("(sss)", js_code, client_bus, client_path), NULL,
      G_DBUS_CALL_FLAGS_NONE, -1, NULL, NULL, NULL);

  g_main_loop_run(loop);

  g_dbus_connection_unregister_object(conn, reg_id);
  g_dbus_node_info_unref(node);
  g_main_loop_unref(loop);
  g_free(client_bus);
  g_free(client_path);
  return 0;
}

static gchar *opt_config = NULL;
static gchar *opt_bus_name = NULL;
static gchar *opt_toggle_window = NULL;
static gchar *opt_run_js = NULL;
static gchar *opt_run_file = NULL;
static gboolean opt_version = FALSE;
static gboolean opt_quit = FALSE;
static gboolean opt_inspector = FALSE;
static gboolean opt_init = FALSE;
static gboolean opt_clear_cache = FALSE;

static GOptionEntry cli_entries[] = {
    {"version", 'v', 0, G_OPTION_ARG_NONE, &opt_version,
     "Print version and exit", NULL},
    {"quit", 'q', 0, G_OPTION_ARG_NONE, &opt_quit, "Kill AGS", NULL},
    {"config", 'c', 0, G_OPTION_ARG_FILENAME, &opt_config,
     "Path to the config file", "FILE"},
    {"bus-name", 'b', 0, G_OPTION_ARG_STRING, &opt_bus_name,
     "Bus name of the process", "NAME"},
    {"inspector", 'i', 0, G_OPTION_ARG_NONE, &opt_inspector,
     "Open the GTK debug tool", NULL},
    {"toggle-window", 't', 0, G_OPTION_ARG_STRING, &opt_toggle_window,
     "Show or hide a window", "NAME"},
    {"run-js", 'r', 0, G_OPTION_ARG_STRING, &opt_run_js,
     "Execute string as an async function", "CODE"},
    {"run-file", 'f', 0, G_OPTION_ARG_FILENAME, &opt_run_file,
     "Execute file as an async function", "FILE"},
    {"init", 0, 0, G_OPTION_ARG_NONE, &opt_init,
     "Initialize the configuration directory", NULL},
    {"clear-cache", 0, 0, G_OPTION_ARG_NONE, &opt_clear_cache,
     "Remove the AGS cache directory and exit", NULL},
    {NULL},
};

int main(int argc, char *argv[]) {
  /* Save original argv before GOptionContext strips recognized options */
  char **orig_argv = g_memdup2(argv, (argc + 1) * sizeof(char *));
  orig_argv[argc] = NULL;

  GError *err = NULL;
  GOptionContext *ctx = g_option_context_new("[CONFIG]");

  g_option_context_add_main_entries(ctx, cli_entries, NULL);
  g_option_context_set_summary(ctx, "Customizable and extensible shell");

  if (!g_option_context_parse(ctx, &argc, &argv, &err)) {
    g_printerr("ags: %s\n", err->message);
    g_error_free(err);
    g_option_context_free(ctx);
    g_free(orig_argv);
    return 1;
  }
  g_option_context_free(ctx);

  if (argc > 1 && !opt_config)
    opt_config = g_strdup(argv[1]);

  if (opt_version) {
    g_print("%s\n", PACKAGE_VERSION);
    g_free(orig_argv);
    return 0;
  }

  if (opt_clear_cache) {
    do_clear_cache();
    g_free(orig_argv);
    return 0;
  }

  const gchar *bname = opt_bus_name ? opt_bus_name : bin_name();
  gchar *def_config =
      g_build_filename(g_get_user_config_dir(), bin_name(), "config.js", NULL);
  const gchar *config_path = opt_config ? opt_config : def_config;
  gchar *config_dir = g_path_get_dirname(config_path);

  if (opt_init) {
    do_init(config_dir, config_path);
    g_free(config_dir);
    g_free(def_config);
    g_free(orig_argv);
    return 0;
  }

  gchar *app_bus = make_app_bus(bname);
  gchar *app_path = bus_to_path(app_bus);

  GDBusConnection *conn = g_bus_get_sync(G_BUS_TYPE_SESSION, NULL, &err);
  if (!conn) {
    g_printerr("Cannot connect to session bus: %s\n", err->message);
    g_error_free(err);
    g_free(app_bus);
    g_free(app_path);
    g_free(config_dir);
    g_free(def_config);
    g_free(orig_argv);
    return 1;
  }

  if (!is_running(conn, app_bus)) {
    if (opt_quit) {
      g_object_unref(conn);
      g_free(app_bus);
      g_free(app_path);
      g_free(config_dir);
      g_free(def_config);
      g_free(orig_argv);
      return 0;
    }

    g_object_unref(conn);
    g_free(app_bus);
    g_free(app_path);
    g_free(config_dir);
    g_free(def_config);

    execv(GJS_LAUNCHER, orig_argv);
    perror("execv " GJS_LAUNCHER);
    g_free(orig_argv);
    return 1;
  }

  int ret = 0;

  if (opt_toggle_window) {
    GDBusProxy *proxy = make_proxy(conn, app_bus, app_path);
    if (proxy) {
      do_toggle_window(proxy, opt_toggle_window);
      g_object_unref(proxy);
    } else
      ret = 1;
  } else if (opt_quit) {
    GDBusProxy *proxy = make_proxy(conn, app_bus, app_path);
    if (proxy) {
      proxy_call_void(proxy, "Quit", NULL);
      g_object_unref(proxy);
    } else
      ret = 1;
  } else if (opt_inspector) {
    GDBusProxy *proxy = make_proxy(conn, app_bus, app_path);
    if (proxy) {
      proxy_call_void(proxy, "Inspector", NULL);
      g_object_unref(proxy);
    } else
      ret = 1;
  } else if (opt_run_js) {
    ret = do_run_js(conn, app_bus, app_path, opt_run_js);
  } else if (opt_run_file) {
    gchar *contents = NULL;
    gsize length = 0;
    if (!g_file_get_contents(opt_run_file, &contents, &length, &err)) {
      g_printerr("Cannot read %s: %s\n", opt_run_file, err->message);
      g_error_free(err);
      ret = 1;
    } else {
      ret = do_run_js(conn, app_bus, app_path, contents);
      g_free(contents);
    }
  } else {
    g_print("Ags with busname \"%s\" is already running\n", bname);
  }

  g_object_unref(conn);
  g_free(app_bus);
  g_free(app_path);
  g_free(config_dir);
  g_free(def_config);
  g_free(orig_argv);
  return ret;
}
