import { LitElement, type PropertyValues, css, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

@customElement('dsp-overload-indicator')
export class DSPOverloadIndicator extends LitElement {
  @property({ type: Number }) currentPromptAverage = 0;
  @property({ type: Number }) currentKnobAverageExtremeness = 0;
  @property({ type: String }) indicatorColor = 'yellow'; // New property for color
  @property({ type: String }) blinkDuration = '2s'; // New property for blink duration

  @state() private _visible = false;

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
      box-shadow: 0 0 5px var(--indicator-color), 0 0 10px var(--indicator-color);
      animation: blink var(--blink-duration) infinite;
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
  `;

  updated(changedProperties: PropertyValues) {
    super.updated(changedProperties);

    if (
      changedProperties.has('currentPromptAverage') ||
      changedProperties.has('currentKnobAverageExtremeness') ||
      changedProperties.has('indicatorColor') || // React to color changes
      changedProperties.has('blinkDuration') // React to duration changes
    ) {
      this._visible =
        this.currentPromptAverage > 1.0 ||
        this.currentKnobAverageExtremeness > 0.5;

      if (this._visible) {
        this.classList.add('is-visible');
        // Only set 'animating' if prompt average is above 1.0, or if a specific color/duration is passed
        // The logic for setting 'animating' is now simplified as color/duration are passed in.
        if (this.currentPromptAverage > 1.0 || this.currentKnobAverageExtremeness > 0.5) {
          this.setAttribute('animating', '');
        } else {
          this.removeAttribute('animating');
        }
        // The color and blink duration are now controlled by the parent component via properties.
        // No need to set them here based on internal logic.
        this.style.setProperty('--indicator-color', this.indicatorColor);
        this.style.setProperty('--blink-duration', this.blinkDuration);
      } else {
        this.classList.remove('is-visible');
        this.removeAttribute('animating');
        // Reset CSS variables when not visible, though they won't apply
        this.style.setProperty('--indicator-color', 'yellow');
        this.style.setProperty('--blink-duration', '2s');
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
