---
title: Hyprland
category: Guides
group: Services
---

## signals

- `event`: `(name: string, data: string)`:
  [hyprland ipc events](https://wiki.hyprland.org/IPC/#events-list)
- `urgent-window`: `(address: string)`
- `keyboard-layout`: `(deviceName: string, layoutName: string)`
- `submap`: `(name: string)`
- `monitor-added`: `(name: string)`
- `monitor-removed`: `(name: string)`
- `workspace-added`: `(name: string)`
- `workspace-removed`: `(name: string)`
- `client-added`: `(address: string)`
- `client-removed`: `(address: string)`
- `kill`: `(address: string)`
- `fullscreen`: `(isFullscreen: boolean)`
- `screencast`: `(state: boolean, owner: number, target: string)`
- `activespecial`: `(workspaceName: string, monitorName: string)`
- `pin`: `(address: string, pinned: boolean)`
- `minimized`: `(address: string, minimized: boolean)`
- `bell`: `(address: string)`
- `lockgroups`: `(locked: boolean)`
- `empty`: `(workspaceId: string)`
- `configreloaded`: (no parameters)
- `custom`: `(params: string)`

## properties

- `active`: `Active` see below
- `monitors`: `Monitor[]` a Monitor is the object you would get with
  `hyprctl monitors -j`
- `workspaces`: `Workspace[]` a Workspace is the object you would get with
  `hyprctl workspaces -j`
- `clients`: `Client[]` a Client is the object you would get with
  `hyprctl clients -j`

## methods

- `getMonitor`: `(id: number) => Monitor`
- `getWorkspace`: `(id: number) => Workspace`
- `getClient`: `(address: string) => Client`
- `getGdkMonitor`: `(id: number) => Gdk.Monitor | null`: returns the GDK monitor
  corresponding to the given Hyprland monitor ID, or `null` if not found
- `message`: `(msg: string) => string`: send a message to the
  [hyprland socket](https://wiki.hyprland.org/IPC/#tmphyprhissocketsock)
- `messageAsync`: `(msg: string) => Promise<string>`: async version of message
- `dispatch`: typed, Lua-native dispatch API mirroring Hyprland's `hl.dsp.*`
  namespace, see [Dispatching](#dispatching) below
- `eval`: `(lua: string) => Promise<string>`: run a raw Lua string via the
  socket's `eval` request, returns `ok` or the raised error
- `dispatchLegacy`: `(command: string) => Promise<string>`: **deprecated**, runs
  a legacy text dispatch command (e.g. `workspace 1`). Prefer `dispatch`

## Dispatching

Hyprland 0.55 replaced its text command socket with a Lua interpreter, so the
old text protocol (`dispatch workspace 1`) is rejected by the compositor. Use
the `dispatch` namespace, which builds the `hl.dsp.*` calls for you:

```js
hyprland.dispatch.focus({ workspace: "3" });
hyprland.dispatch.exec("firefox");
hyprland.dispatch.window.close(); // active window
hyprland.dispatch.window.float({ action: "toggle" });
hyprland.dispatch.workspace.toggleSpecial("magic");

// escape hatch for anything not wrapped:
hyprland.dispatch.raw("hl.dsp.focus({ urgent_or_last = true })");
// or arbitrary Lua:
hyprland.eval("hl.dispatch(hl.dsp.exit())");
```

Existing configs that call `messageAsync("dispatch ...")` keep working: legacy
dispatch strings are translated to Lua automatically, with a one-time
deprecation warning. This compatibility shim targets Hyprland 0.55+ only.

## Active

```ts
interface Active {
  monitor: {
    id: number;
    name: string;
  };
  workspace: {
    id: number;
    name: string;
  };
  client: {
    address: string;
    title: string;
    class: string;
  };
}
```

The `active` property is composed by subservices, meaning you connect to any sub
prop

```js
const widget = Widget({
  setup: (self) =>
    self
      .hook(hyprland, (self) => {})
      .hook(hyprland.active, (self) => {})
      .hook(hyprland.active.monitor, (self) => {})
      .hook(hyprland.active.workspace, (self) => {})
      .hook(hyprland.active.client, (self) => {})
      .bind("prop", hyprland, "active", (active) => {})
      .bind("prop", hyprland.active, "monitor", (monitor) => {})
      .bind("prop", hyprland.active, "workspace", (ws) => {})
      .bind("prop", hyprland.active, "client", (client) => {})
      .bind("prop", hyprland.active.monitor, "id", (id) => {})
      .bind("prop", hyprland.active.workspace, "id", (id) => {})
      .bind("prop", hyprland.active.client, "address", (address) => {}),
});
```

## Example Widget

```js
const hyprland = await Service.import("hyprland");

const focusedTitle = Widget.Label({
  label: hyprland.active.client.bind("title"),
  visible: hyprland.active.client.bind("address")
    .as((addr) => addr !== "0x"),
});

const focusWorkspace = (ws) => hyprland.dispatch.focus({ workspace: `${ws}` });

const Workspaces = () =>
  Widget.EventBox({
    onScrollUp: () => focusWorkspace("+1"),
    onScrollDown: () => focusWorkspace("-1"),
    child: Widget.Box({
      children: Array.from({ length: 10 }, (_, i) => i + 1).map((i) =>
        Widget.Button({
          attribute: i,
          label: `${i}`,
          onClicked: () => focusWorkspace(i),
        })
      ),

      // remove this setup hook if you want fixed number of buttons
      setup: (self) =>
        self.hook(hyprland, () =>
          self.children.forEach((btn) => {
            btn.visible = hyprland.workspaces.some((ws) =>
              ws.id === btn.attribute
            );
          })),
    }),
  });
```
