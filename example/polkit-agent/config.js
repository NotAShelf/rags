const polkit = await Service.import("polkit")

const password = Widget.Entry({
    visibility: false,
    placeholder_text: "Password",
    on_accept: (self) => {
        polkit.respond(self.text)
        self.text = ""
    },
})

function PolkitDialog() {
    return Widget.Window({
        name: "polkit-agent",
        class_name: "polkit-agent",
        layer: "overlay",
        keymode: "exclusive",
        visible: polkit.bind("active"),
        child: Widget.Box({
            vertical: true,
            class_name: "polkit-card",
            children: [
                Widget.Label({
                    class_name: "polkit-title",
                    label: polkit.bind("current-request").as(request => {
                        return request?.message || "Authentication Required"
                    }),
                }),
                Widget.Label({
                    class_name: "polkit-prompt",
                    label: polkit.bind("prompt").as(prompt => prompt?.message || ""),
                }),
                password,
                Widget.Box({
                    hpack: "end",
                    children: [
                        Widget.Button({
                            label: "Cancel",
                            on_clicked: () => polkit.cancel(),
                        }),
                        Widget.Button({
                            label: "Authenticate",
                            on_clicked: () => {
                                polkit.respond(password.text)
                                password.text = ""
                            },
                        }),
                    ],
                }),
            ],
        }),
    })
}

polkit.connect("request", () => Utils.timeout(100, () => password.grab_focus()))
polkit.connect("show-error", (_, message) => print(`polkit: ${message}`))
polkit.registerAgent()

App.config({
    style: App.configDir + "/style.css",
    windows: [PolkitDialog()],
})
