import { LitElement, type PropertyValues, css, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

@customElement('dsp-overload-indicator')
export class DSPOverloadIndicator extends LitElement {
  @property({ type: Number }) currentPromptAverage = 0;
  @property({ type: Number }) currentKnobAverageExtremeness = 0;
  @state() private _visible = false;
  @state() private _indicatorColor = 'yellow';
  @state() private _blinkDuration = '2s';
  @state() private _isCyclingRgb = false;
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

    :host([animating].is-visible) {
      animation: blink var(--blink-duration) infinite;
    }

    :host([animating].is-visible):not([rgb-cycling]) {
      box-shadow: 0 0 5px var(--indicator-color), 0 0 10px var(--indicator-color);
    }

    :host([rgb-cycling].is-visible) {
      animation: rgb-cycle var(--rgb-cycle-speed) infinite linear,
                 blink var(--blink-duration) infinite;
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

      let calculatedColor = 'white'; // Default, will be overridden if visible
      let calculatedBlinkDuration = '2s';
      let shouldAnimateBlink = false;
      let shouldCycleRgb = false;
      let rgbCycleSpeed = 1.0; // Default speed for RGB cycle

      // Apply thresholds based on the combined overload factor
      if (overloadFactor > 0.5) {
        calculatedColor = 'green';
        shouldAnimateBlink = true;
      }
      if (overloadFactor > 0.75) {
        calculatedColor = 'yellow';
        calculatedBlinkDuration = '1.5s';
        shouldAnimateBlink = true;
      }
      if (overloadFactor > 1.0) {
        calculatedColor = 'red';
        calculatedBlinkDuration = '1s';
        shouldAnimateBlink = true;
      }
      if (overloadFactor > 1.25) {
        calculatedColor = 'purple';
        calculatedBlinkDuration = '0.7s';
        shouldAnimateBlink = true;
      }
      if (overloadFactor > 1.5) {
        calculatedColor = 'magenta'; // This color is for the threshold, but RGB cycle takes over visual
        shouldCycleRgb = true;
        // Calculate speed: faster as overloadFactor goes from 1.5 to 2.0
        const minSpeed = 0.2; // Fastest speed (e.g., at overloadFactor = 2.0)
        const maxSpeed = 1.0; // Slowest speed (e.g., at overloadFactor = 1.5)
        const range = 2.0 - 1.5; // Range of overloadFactor for this effect (0.5)
        const normalizedOverload = Math.min(1, Math.max(0, (overloadFactor - 1.5) / range)); // 0 to 1
        rgbCycleSpeed = maxSpeed - (normalizedOverload * (maxSpeed - minSpeed));
        calculatedBlinkDuration = `${rgbCycleSpeed}s`; // Blink speed matches RGB cycle speed
        shouldAnimateBlink = true; // Always blink when RGB cycling
      }

      // Apply states and attributes
      if (this._visible) {
        this.classList.add('is-visible');
        if (shouldAnimateBlink) {
          this.setAttribute('animating', '');
        } else {
          this.removeAttribute('animating');
        }
        if (shouldCycleRgb) {
          this.setAttribute('rgb-cycling', '');
        } else {
          this.removeAttribute('rgb-cycling');
        }
        this.style.setProperty('--indicator-color', calculatedColor);
        this.style.setProperty('--blink-duration', calculatedBlinkDuration);
        this.style.setProperty('--rgb-cycle-speed', `${rgbCycleSpeed}s`);
      } else {
        this.classList.remove('is-visible');
        this.removeAttribute('animating');
        this.removeAttribute('rgb-cycling');
        // Reset CSS variables when not visible
        this.style.setProperty('--indicator-color', 'yellow');
        this.style.setProperty('--blink-duration', '2s');
        this.style.setProperty('--rgb-cycle-speed', '1s');
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
