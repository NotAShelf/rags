import Gtk from "gi://Gtk?version=3.0"

const lockscreen = await Service.import("lockscreen")

const password = Variable("")
const unlockError = Variable("")

function LockSurface(_monitor, index) {
    const entry = Widget.Entry({
        visibility: false,
        placeholder_text: "Password",
        text: password.bind(),
        on_change: ({ text }) => password.value = text,
        on_accept: async () => {
            try {
                await lockscreen.unlockWithPassword(password.value, undefined, "login")
                password.value = ""
                unlockError.value = ""
            } catch (error) {
                password.value = ""
                unlockError.value = "Authentication failed"
                logError(error, "unlock failed")
            }
        },
    })

    return new Gtk.Window({
        name: `lock-${index}`,
        child: Widget.Box({
            vertical: true,
            hpack: "center",
            vpack: "center",
            class_name: "lock-card",
            children: [
                Widget.Label({
                    class_name: "lock-title",
                    label: "Session Locked",
                }),
                entry,
                Widget.Label({
                    class_name: "error",
                    visible: unlockError.bind().as(Boolean),
                    label: unlockError.bind(),
                }),
            ],
            setup: () => Utils.timeout(100, () => entry.grab_focus()),
        }),
    })
}

function LockButton() {
    return Widget.Window({
        name: "lock-button",
        anchor: ["top", "right"],
        margins: [12, 12],
        child: Widget.Button({
            class_name: "lock-button",
            label: "Lock",
            on_clicked: () => {
                try {
                    lockscreen.lock(LockSurface)
                } catch (error) {
                    logError(error, "session-lock unavailable")
                }
            },
        }),
    })
}

App.config({
    style: App.configDir + "/style.css",
    windows: [LockButton()],
})
