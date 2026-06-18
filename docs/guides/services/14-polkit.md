---
title: Polkit
description: Polkit authentication agent integration
category: Guides
group: Services
---

The `polkit` service registers RAGS as a polkit authentication agent for the
current user session.

The sensitive part of the flow is implemented in the native `GUtils` helper: it
subclasses `PolkitAgent.Listener` and uses `PolkitAgent.Session`, which
delegates successful responses through polkit's setuid helper. JavaScript code
only receives request metadata and sends prompt responses.

## Example

```js
const polkit = await Service.import("polkit");

const password = Widget.Entry({
  visibility: false,
  on_accept: (self) => {
    polkit.respond(self.text);
    self.text = "";
  },
});

const dialog = Widget.Window({
  name: "polkit",
  layer: "overlay",
  keymode: "exclusive",
  visible: polkit.bind("active"),
  child: Widget.Box({
    vertical: true,
    children: [
      Widget.Label({
        label: polkit.bind("current-request").as((request) => {
          return request?.message ?? "";
        }),
      }),
      Widget.Label({
        label: polkit.bind("prompt").as((prompt) => {
          return prompt?.message ?? "";
        }),
      }),
      password,
      Widget.Button({
        label: "Cancel",
        on_clicked: () => polkit.cancel(),
      }),
    ],
  }),
});

polkit.connect(
  "request",
  () => Utils.timeout(100, () => password.grab_focus()),
);
polkit.connect("show-error", (_, message) => print(message));
polkit.registerAgent();
```

## Identity Selection

By default, the service selects the first identity polkit offers. Disable this
if your UI lets the user choose an identity:

```js
polkit.autoSelectIdentity = false;
polkit.connect("begin", (_, request) => {
  request.identities.forEach((identity, index) => {
    print(`${index}: ${identity.name ?? identity.id}`);
  });
});

polkit.selectIdentity(0);
```

## API

### Properties

- `registered`: `boolean` - whether this process is registered as an agent.
- `active`: `boolean` - whether an authentication request is active.
- `current_request`: object or `null` - action id, message, details, and
  identities.
- `prompt`: object or `null` - prompt message and whether echo is allowed.

### Methods

- `registerAgent(options?)` registers the current process as an agent.
- `unregisterAgent()` unregisters the agent.
- `selectIdentity(index)` starts authentication for an offered identity.
- `respond(response)` answers the current prompt.
- `cancel()` cancels the current authentication request.

### Signals

- `begin(request)` fires when polkit starts an authentication request.
- `request(prompt)` fires when PAM asks for input.
- `show-info(message)` and `show-error(message)` forward PAM messages.
- `completed(authorized)` fires when the authentication session ends.
- `cancelled` fires when polkit or the user cancels the request.
