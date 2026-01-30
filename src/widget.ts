import Gtk from 'gi://Gtk?version=3.0';
import { register, type BaseProps, type Widget as TWidget } from './widgets/widget.js';
import { newBox as Box } from './widgets/box.js';
import { newButton as Button } from './widgets/button.js';
import { newCalendar as Calendar } from './widgets/calendar.js';
import { newCenterBox as CenterBox } from './widgets/centerbox.js';
import { newCircularProgress as CircularProgress } from './widgets/circularprogress.js';
import { newColorButton as ColorButton } from './widgets/colorbutton.js';
import { newDrawingArea as DrawingArea } from './widgets/drawingarea.js';
import { newEntry as Entry } from './widgets/entry.js';
import { newEventBox as EventBox } from './widgets/eventbox.js';
import { newFileChooserButton as FileChooserButton } from './widgets/filechooserbutton.js';
import { newFixed as Fixed } from './widgets/fixed.js';
import { newFlowBox as FlowBox } from './widgets/flowbox.js';
import { newFontButton as FontButton } from './widgets/fontbutton.js';
import { newIcon as Icon } from './widgets/icon.js';
import { newLabel as Label } from './widgets/label.js';
import { newLevelBar as LevelBar } from './widgets/levelbar.js';
import { newListBox as ListBox } from './widgets/listbox.js';
import { newMenu as Menu } from './widgets/menu.js';
import { newMenuBar as MenuBar } from './widgets/menubar.js';
import { newMenuItem as MenuItem } from './widgets/menuitem.js';
import { newOverlay as Overlay } from './widgets/overlay.js';
import { newProgressBar as ProgressBar } from './widgets/progressbar.js';
import { newRevealer as Revealer } from './widgets/revealer.js';
import { newScrollable as Scrollable } from './widgets/scrollable.js';
import { newSeparator as Separator } from './widgets/separator.js';
import { newSlider as Slider } from './widgets/slider.js';
import { newSpinButton as SpinButton } from './widgets/spinbutton.js';
import { newSpinner as Spinner } from './widgets/spinner.js';
import { newStack as Stack } from './widgets/stack.js';
import { newSwitch as Switch } from './widgets/switch.js';
import { newToggleButton as ToggleButton } from './widgets/togglebutton.js';
import { newWindow as Window } from './widgets/window.js';

/**
 * Creates a subclassed AGS widget factory from a GTK widget class.
 *
 * Registers the subclass as a GObject and returns a factory function
 * that creates instances with AGS widget features (binding, hooking, etc.).
 *
 * Also serves as the default export namespace containing all built-in
 * widget factories (e.g., `Widget.Box`, `Widget.Label`).
 *
 * @typeParam T - The base GTK widget class
 * @typeParam Props - The constructor props type for the base class
 * @param Base - The GTK widget class to subclass
 * @param typename - GObject type name (defaults to the class name)
 * @returns A factory function that creates widget instances
 *
 * @example
 * ```typescript
 * // Create a custom widget from a GTK class
 * const MyWidget = Widget(Gtk.DrawingArea, 'MyDrawingArea');
 *
 * // Use built-in widget factories
 * const box = Widget.Box({ children: [Widget.Label({ label: 'hello' })] });
 * ```
 */
export default function W<T extends { new (...args: any[]): Gtk.Widget }, Props>(
    Base: T,
    typename = Base.name,
) {
    class Subclassed extends Base {
        static {
            register(this, { typename });
        }

        constructor(...params: any[]) {
            super(...params);
        }
    }
    type Instance<Attr> = InstanceType<typeof Subclassed> & TWidget<Attr>;
    return <Attr>(props: BaseProps<Instance<Attr>, Props, Attr>) => {
        return new Subclassed(props) as Instance<Attr>;
    };
}

export {
    register,
    W as subclass,
    Box,
    Button,
    Calendar,
    CenterBox,
    CircularProgress,
    ColorButton,
    DrawingArea,
    Entry,
    EventBox,
    FileChooserButton,
    Fixed,
    FlowBox,
    FontButton,
    Icon,
    Label,
    LevelBar,
    ListBox,
    Menu,
    MenuBar,
    MenuItem,
    Overlay,
    ProgressBar,
    Revealer,
    Scrollable,
    Separator,
    Slider,
    SpinButton,
    Spinner,
    Stack,
    Switch,
    ToggleButton,
    Window,
};

W.register = register;
W.subclass = W;
W.Box = Box;
W.Button = Button;
W.Calendar = Calendar;
W.CenterBox = CenterBox;
W.CircularProgress = CircularProgress;
W.ColorButton = ColorButton;
W.DrawingArea = DrawingArea;
W.Entry = Entry;
W.EventBox = EventBox;
W.FileChooserButton = FileChooserButton;
W.Fixed = Fixed;
W.FlowBox = FlowBox;
W.FontButton = FontButton;
W.Icon = Icon;
W.Label = Label;
W.LevelBar = LevelBar;
W.ListBox = ListBox;
W.Menu = Menu;
W.MenuBar = MenuBar;
W.MenuItem = MenuItem;
W.Overlay = Overlay;
W.ProgressBar = ProgressBar;
W.Revealer = Revealer;
W.Scrollable = Scrollable;
W.Separator = Separator;
W.Slider = Slider;
W.SpinButton = SpinButton;
W.Spinner = Spinner;
W.Stack = Stack;
W.Switch = Switch;
W.ToggleButton = ToggleButton;
W.Window = Window;
