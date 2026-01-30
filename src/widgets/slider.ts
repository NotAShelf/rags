import { register, type BaseProps, type Widget } from './widget.js';
import Gtk from 'gi://Gtk?version=3.0';
import Gdk from 'gi://Gdk?version=3.0';

type EventHandler<Self> = (self: Self, event: Gdk.Event) => void | unknown;

const POSITION = {
    left: Gtk.PositionType.LEFT,
    right: Gtk.PositionType.RIGHT,
    top: Gtk.PositionType.TOP,
    bottom: Gtk.PositionType.BOTTOM,
} as const;

type Position = keyof typeof POSITION;

type Mark = [number, string?, Position?] | number;

/** Props for the Slider widget. */
export type SliderProps<Attr = unknown, Self = Slider<Attr>> = BaseProps<
    Slider<Attr>,
    Gtk.Scale.ConstructorProps & {
        on_change?: EventHandler<Self>;
        value?: number;
        slider?: boolean;
        min?: number;
        max?: number;
        step?: number;
        marks?: Mark[];
    },
    Attr
>;

/**
 * Creates a new Slider widget for selecting a numeric value within a range.
 *
 * @example
 * const slider = newSlider({
 *     min: 0,
 *     max: 100,
 *     value: 50,
 *     on_change: (self) => print(self.value),
 * });
 */
export function newSlider<Attr = unknown>(...props: ConstructorParameters<typeof Slider<Attr>>) {
    return new Slider(...props);
}

/** GTK Scale wrapper providing a draggable slider for numeric value selection. */
export interface Slider<Attr> extends Widget<Attr> {}
export class Slider<Attr> extends Gtk.Scale {
    static {
        register(this, {
            properties: {
                dragging: ['boolean', 'r'],
                vertical: ['boolean', 'rw'],
                value: ['double', 'rw'],
                min: ['double', 'rw'],
                max: ['double', 'rw'],
                step: ['double', 'rw'],
                'on-change': ['jsobject', 'rw'],
            },
        });
    }

    constructor(
        {
            value = 0,
            min = 0,
            max = 1,
            step = 0.01,
            marks = [],
            ...rest
        }: SliderProps<Attr> = {} as SliderProps<Attr>,
    ) {
        super({
            ...(rest as Gtk.Scale.ConstructorProps),
            adjustment: new Gtk.Adjustment(),
        });

        this._handleParamProp('value', value);
        this._handleParamProp('min', min);
        this._handleParamProp('max', max);
        this._handleParamProp('step', step);
        this._handleParamProp('marks', marks);

        this.adjustment.connect('notify::value', (_, event: Gdk.Event) => {
            if (!this.dragging) return;

            this.on_change?.(this, event);
        });
    }

    /** Callback invoked when the slider value changes during user interaction. */
    get on_change() {
        return this._get('on-change');
    }

    set on_change(callback: EventHandler<this>) {
        this._set('on-change', callback);
    }

    /** The current numeric value of the slider. */
    get value() {
        return this.adjustment.value;
    }

    set value(value: number) {
        if (this.dragging || this.value === value) return;

        this.adjustment.value = value;
        this.notify('value');
    }

    /** The minimum allowed value. */
    get min() {
        return this.adjustment.lower;
    }

    set min(min: number) {
        if (this.min === min) return;

        this.adjustment.lower = min;
        this.notify('min');
    }

    /** The maximum allowed value. */
    get max() {
        return this.adjustment.upper;
    }

    set max(max: number) {
        if (this.max === max) return;

        this.adjustment.upper = max;
        this.notify('max');
    }

    /** The step increment for keyboard and scroll adjustments. */
    get step() {
        return this.adjustment.step_increment;
    }

    set step(step: number) {
        if (this.step === step) return;

        this.adjustment.step_increment = step;
        this.notify('step');
    }

    /** Scale marks displayed along the slider track. */
    set marks(marks: Mark[]) {
        this.clear_marks();
        marks.forEach(mark => {
            if (typeof mark === 'number') {
                this.add_mark(mark, Gtk.PositionType.TOP, '');
            } else {
                const positionType = mark[2] ? POSITION[mark[2]] : Gtk.PositionType.TOP;

                this.add_mark(mark[0], positionType, mark[1] || '');
            }
        });
    }

    /** Whether the slider is currently being dragged by the user. */
    get dragging() {
        return this._get('dragging');
    }

    set dragging(dragging: boolean) {
        this._set('dragging', dragging);
    }

    /** Whether the slider is oriented vertically. */
    get vertical() {
        return this.orientation === Gtk.Orientation.VERTICAL;
    }

    set vertical(v: boolean) {
        this.orientation = Gtk.Orientation[v ? 'VERTICAL' : 'HORIZONTAL'];
    }

    vfunc_button_release_event(event: Gdk.EventButton): boolean {
        this.dragging = false;
        return super.vfunc_button_release_event(event);
    }

    vfunc_button_press_event(event: Gdk.EventButton): boolean {
        this.dragging = true;
        return super.vfunc_button_press_event(event);
    }

    vfunc_key_press_event(event: Gdk.EventKey): boolean {
        this.dragging = true;
        return super.vfunc_key_press_event(event);
    }

    vfunc_key_release_event(event: Gdk.EventKey): boolean {
        this.dragging = false;
        return super.vfunc_key_release_event(event);
    }

    vfunc_scroll_event(event: Gdk.EventScroll): boolean {
        this._set('dragging', true, false);
        event.delta_y > 0
            ? (this.adjustment.value -= this.step)
            : (this.adjustment.value += this.step);
        this._set('dragging', false, false);
        return super.vfunc_scroll_event(event);
    }
}

export default Slider;
