import { LitElement, type PropertyValues, css, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

interface OverloadThresholdConfig {
  threshold: number;
  color: string;
  blinkDuration: string; // Can be a fixed string like '1s' or 'dynamic' for RGB cycling
  rgbCycling?: boolean;
  rgbCycleSpeedMin?: number; // Fastest speed (at max overload)
  rgbCycleSpeedMax?: number; // Slowest speed (at min overload for this range)
}

@customElement('dsp-overload-indicator')
export class DSPOverloadIndicator extends LitElement {
  @property({ type: Number }) currentPromptAverage = 0;
  @property({ type: Number }) currentKnobAverageExtremeness = 0;
  @state() private _visible = false;
  @state() private _blinkDuration = '2s';
  @state() private _rgbCycleSpeed = 1.0;

  static styles = css`
    :host {
      position: fixed;
      top: 10px;
      right: 10px;
      z-index: 9999;
      background: rgba(0, 0, 0, 0.6);
      padding: 8px 12px;
      border-radius: 5px;
      border: 1px solid #555;
      color: white;
      display: none; /* Hidden by default */
    }

    :host(.is-visible) {
      display: block;
    }

    :host(.is-visible) {
      animation: rgb-cycle var(--rgb-cycle-speed) infinite linear,
                 blink var(--blink-duration) infinite;
      box-shadow: 0 0 5px var(--rgb-color), 0 0 10px var(--rgb-color);
    }

    @keyframes blink {
      0%,
      100% {
        opacity: 1;
      }
      50% {
        opacity: 0.6;
      }
    }

    @keyframes rgb-cycle {
      0% {
        box-shadow: 0 0 5px red, 0 0 10px red;
      }
      33% {
        box-shadow: 0 0 5px blue, 0 0 10px blue;
      }
      66% {
        box-shadow: 0 0 5px green, 0 0 10px green;
      }
      100% {
        box-shadow: 0 0 5px red, 0 0 10px red;
      }
    }
  `;

  updated(changedProperties: PropertyValues) {
    super.updated(changedProperties);

    if (
      changedProperties.has('currentPromptAverage') ||
      changedProperties.has('currentKnobAverageExtremeness')
    ) {
      const promptAvg = this.currentPromptAverage;
      const knobExt = this.currentKnobAverageExtremeness;

      // Calculate a combined overload factor
      const overloadFactor = Math.max(promptAvg, knobExt) * 2;

      // Determine visibility based on the combined overload factor
      this._visible = overloadFactor > 0.5;

      if (this._visible) {
        // Overload is active, so always animate with RGB cycling and blinking
        this.classList.add('is-visible');
        this.setAttribute('animating', ''); // Always animate blink
        this.setAttribute('rgb-cycling', ''); // Always RGB cycle

        // Calculate speed: faster as overloadFactor increases from 0.5 to 2.0
        // Min speed (fastest) at overloadFactor = 2.0 (0.2s)
        // Max speed (slowest) at overloadFactor = 0.5 (1.0s)
        const minOverload = 0.5;
        const maxOverload = 2.0;
        const minSpeed = 0.2; // Fastest cycle/blink
        const maxSpeed = 1.0; // Slowest cycle/blink

        // Normalize overloadFactor from [0.5, 2.0] to [0, 1]
        const normalizedOverload = Math.min(1, Math.max(0, (overloadFactor - minOverload) / (maxOverload - minOverload)));

        // Interpolate speed: higher normalizedOverload means faster speed (smaller value)
        this._rgbCycleSpeed = maxSpeed - (normalizedOverload * (maxSpeed - minSpeed));
        this._blinkDuration = `${this._rgbCycleSpeed}s`; // Blink speed matches RGB cycle speed

        this.style.setProperty('--blink-duration', this._blinkDuration);
        this.style.setProperty('--rgb-cycle-speed', `${this._rgbCycleSpeed}s`);
      } else {
        this.classList.remove('is-visible');
        this.removeAttribute('animating');
        this.removeAttribute('rgb-cycling');
        // Reset CSS variables when not visible
        this.style.setProperty('--blink-duration', '2s'); // Default reset duration
        this.style.setProperty('--rgb-cycle-speed', '1s'); // Default reset speed
      }
    }
  }

  render() {
    return html`DSP Overload`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dsp-overload-indicator': DSPOverloadIndicator;
  }
}
