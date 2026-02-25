const battery = await Service.import('battery');
const audio = await Service.import('audio');

const date = Variable('', {
    poll: [1000, 'date "+%H:%M:%S"'],
});

const currentTheme = Variable('catppuccin');
const themes = ['catppuccin', 'nord', 'gruvbox'];

function ThemeSwitcher() {
    return Widget.Button({
        class_name: 'theme-switcher',
        label: currentTheme.bind().as(t => `Theme: ${t}`),
        on_clicked: () => {
            const i = (themes.indexOf(currentTheme.value) + 1) % themes.length;
            const name = themes[i];
            currentTheme.value = name;

            // setTheme resets CSS then applies the theme file
            App.setTheme(name);

            // Re-apply base layout styles on top of theme colours
            App.applyCss(`${App.configDir}/style.css`);
        },
    });
}

function Clock() {
    return Widget.Label({
        class_name: 'clock',
        label: date.bind(),
    });
}

function BatteryIndicator() {
    return Widget.Box({
        class_name: 'battery',
        visible: battery.bind('available'),
        spacing: 4,
        children: [
            Widget.Icon({
                icon: battery
                    .bind('percent')
                    .as(p => `battery-level-${Math.floor(p / 10) * 10}-symbolic`),
            }),
            Widget.Label({
                label: battery.bind('percent').as(p => `${p}%`),
            }),
        ],
    });
}

function VolumeIndicator() {
    return Widget.Box({
        class_name: 'volume',
        spacing: 4,
        children: [
            Widget.Icon({
                icon: Utils.watch('audio-volume-medium-symbolic', audio.speaker, () => {
                    const v = audio.speaker.volume * 100;
                    const muted = audio.speaker.is_muted;
                    if (muted) return 'audio-volume-muted-symbolic';
                    if (v > 67) return 'audio-volume-high-symbolic';
                    if (v > 34) return 'audio-volume-medium-symbolic';
                    return 'audio-volume-low-symbolic';
                }),
            }),
            Widget.Label({
                label: Utils.watch(
                    '0%',
                    audio.speaker,
                    () => `${Math.round(audio.speaker.volume * 100)}%`,
                ),
            }),
        ],
    });
}

function Bar() {
    return Widget.Window({
        name: 'bar',
        anchor: ['top', 'left', 'right'],
        exclusivity: 'exclusive',
        child: Widget.CenterBox({
            class_name: 'bar',
            start_widget: Widget.Box({
                spacing: 8,
                children: [ThemeSwitcher()],
            }),
            center_widget: Clock(),
            end_widget: Widget.Box({
                hpack: 'end',
                spacing: 8,
                children: [VolumeIndicator(), BatteryIndicator()],
            }),
        }),
    });
}

App.config({
    // Base layout styles, these reference @define-color names from themes
    style: './style.css',
    windows: [Bar()],
    themes: {
        catppuccin: `${App.configDir}/themes/catppuccin.css`,
        nord: `${App.configDir}/themes/nord.css`,
        gruvbox: `${App.configDir}/themes/gruvbox.css`,
    },
    onConfigParsed: () => {
        // Apply the default theme on startup
        App.setTheme('catppuccin');
        App.applyCss(`${App.configDir}/style.css`);
    },
});

export {};
