const hyprland = await Service.import('hyprland');
const battery = await Service.import('battery');

// Eagerly constructed: the bar is always visible
function Bar() {
    return Widget.Window({
        name: 'bar',
        anchor: ['top', 'left', 'right'],
        exclusivity: 'exclusive',
        child: Widget.CenterBox({
            start_widget: Widget.Label({
                label: hyprland.active.client.bind('title'),
            }),
            center_widget: Widget.Label({
                label: 'lazy-windows demo',
            }),
            end_widget: Widget.Box({
                hpack: 'end',
                spacing: 8,
                children: [
                    Widget.Button({
                        label: 'Dashboard',
                        on_clicked: () => App.toggleWindow('dashboard'),
                    }),
                    Widget.Button({
                        label: 'Power Menu',
                        on_clicked: () => App.toggleWindow('powermenu'),
                    }),
                ],
            }),
        }),
    });
}

// Lazily constructed: only built when first opened
function Dashboard() {
    // Imagine this is an expensive widget tree with many children
    print('Dashboard: constructing for the first time!');

    return Widget.Window({
        name: 'dashboard',
        anchor: ['top', 'right'],
        layer: 'overlay',
        keymode: 'on-demand',
        visible: false,
        setup: self => self.keybind('Escape', () => App.closeWindow('dashboard')),
        child: Widget.Box({
            vertical: true,
            class_name: 'dashboard',
            css: 'padding: 20px; min-width: 300px;',
            children: [
                Widget.Label({
                    class_name: 'title',
                    css: 'font-size: 1.4em; font-weight: bold;',
                    label: 'Dashboard',
                }),
                Widget.Label({
                    label: battery.bind('percent').as(p => `Battery: ${p}%`),
                }),
                Widget.Label({
                    label: hyprland.bind('workspaces').as(ws => `Workspaces: ${ws.length}`),
                }),
            ],
        }),
    });
}

function PowerMenu() {
    print('PowerMenu: constructing for the first time!');

    return Widget.Window({
        name: 'powermenu',
        layer: 'overlay',
        keymode: 'exclusive',
        visible: false,
        setup: self => self.keybind('Escape', () => App.closeWindow('powermenu')),
        child: Widget.Box({
            class_name: 'powermenu',
            css: 'padding: 20px; min-width: 200px;',
            spacing: 8,
            children: [
                Widget.Button({
                    label: 'Shutdown',
                    on_clicked: () => Utils.exec('systemctl poweroff'),
                }),
                Widget.Button({
                    label: 'Reboot',
                    on_clicked: () => Utils.exec('systemctl reboot'),
                }),
                Widget.Button({
                    label: 'Lock',
                    on_clicked: () => {
                        App.closeWindow('powermenu');
                        Utils.exec('loginctl lock-session');
                    },
                }),
            ],
        }),
    });
}

App.config({
    style: './style.css',
    windows: [Bar()],
    lazyWindows: {
        dashboard: () => Dashboard(),
        powermenu: () => PowerMenu(),
    },
});

export {};
