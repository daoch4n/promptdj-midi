/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { css, html, LitElement, svg } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

/** Maps prompt weight to halo size. */
const MIN_HALO_SCALE = 1;
const MAX_HALO_SCALE = 2;

/** The amount of scale to add to the halo based on audio level. */
const HALO_LEVEL_MODIFIER = 1;

/** How quickly the knob animates to new values. Higher is slower. */
const DEFAULT_ANIMATION_SMOOTHING_FACTOR = 1.0;

const BACKGROUND_EFFECT_SMOOTHING_FACTOR = 0.01;

/** A knob for adjusting and visualizing prompt weight. */
@customElement('weight-knob')
export class WeightKnob extends LitElement {
  static override styles = css`
    :host {
      cursor: grab;
      position: relative;
      width: 100%;
      aspect-ratio: 1;
      flex-shrink: 0;
      touch-action: none;
    }
    svg {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
    }
    #halo {
      position: absolute;
      z-index: -1;
      top: 50%;
      left: 50%;
      width: 66.67px; /* 1.5x smaller than 100px base */
      height: 66.67px;
      border-radius: 50%;
      mix-blend-mode: lighten;
      transform: translate(-50%, -50%); /* Centering using transform */
      will-change: transform;
      opacity: 0.5; /* Added for semi-transparency */
    }
  `;

  // Internal storage for the value property
  private _value = 0;

  @property({ type: Number })
  get value(): number {
    return this._value;
  }

  set value(newVal: number) {
    const oldVal = this._value;
    const clampedNewVal = Math.max(0, Math.min(2, newVal));

    this._value = clampedNewVal;
    this._targetValue = clampedNewVal;

    if (this._animationFrameId === null) {
      this._animateKnob();
    }
    this.requestUpdate('value', oldVal);
  }

  @property({ type: String }) color = '#000'; // Color for halo
  @property({ type: Number }) audioLevel = 0; // Used for halo effect
  @property({ type: String }) displayValue = ''; // Optional value to display instead of this.value

  private _currentValue = 0;
  private _targetValue = 0;
  private _animationFrameId: number | null = null;

  private _backgroundEffectAlpha = 0;
  private _targetBackgroundEffectAlpha = 0;
  private _backgroundAnimationId: number | null = null;

  private _arcDisplayValue = 0;
  private _animatingToArcTargetValue = 0;

  private dragStartPos = 0;
  private dragStartValue = 0;

  constructor() {
    super();
    this._currentValue = this.value;
    this._targetValue = this.value;
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
  }

  override connectedCallback() {
    super.connectedCallback();
    // Initialize _currentValue and _targetValue based on the initial value property.
    // This is important if the value is set before the element is connected to the DOM.
    this._currentValue = this.value;
    this._targetValue = this.value;
    // If there's a difference (e.g. value set programmatically before connection),
    // start animating towards it.
    if (this._currentValue !== this._targetValue && this._animationFrameId === null) {
       this._animateKnob();
    }
    // Initialize background alpha based on initial value
    this.snapBackgroundToCurrentValue();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    if (this._animationFrameId !== null) {
      cancelAnimationFrame(this._animationFrameId);
      this._animationFrameId = null;
    }
    if (this._backgroundAnimationId !== null) {
      cancelAnimationFrame(this._backgroundAnimationId);
      this._backgroundAnimationId = null;
    }
  }

  public triggerBackgroundAnimation(isFadeIn: boolean): void {
    this._animatingToArcTargetValue = this._targetValue; // Capture target for arc scaling
    this._targetBackgroundEffectAlpha = isFadeIn ? 1.0 : 0.0;

    // If an animation is already in progress, it will pick up the new target.
    // If not, start one.
    if (this._backgroundAnimationId === null) {
      this._animateBackgroundEffect();
    }
  }

  public snapBackgroundToCurrentValue(): void {
    if (this._backgroundAnimationId !== null) {
      cancelAnimationFrame(this._backgroundAnimationId);
      this._backgroundAnimationId = null;
    }

    const newAlpha = this._currentValue > 0.001 ? 1.0 : 0.0;
  let needsUpdate = false;

    if (this._backgroundEffectAlpha !== newAlpha) {
      this._backgroundEffectAlpha = newAlpha;
      this._targetBackgroundEffectAlpha = newAlpha; // Sync target as well
    needsUpdate = true;
  }

  // Snap arc display value to the actual current value of the knob
  if (this._arcDisplayValue !== this._currentValue) {
    this._arcDisplayValue = this._currentValue;
    needsUpdate = true;
  }

  // Sync _animatingToArcTargetValue to ensure any subsequent slow animation starts from a consistent state
  this._animatingToArcTargetValue = this._currentValue;

  if (needsUpdate) {
      this.requestUpdate();
    }
  }

  private _animateKnob() {
    const difference = this._targetValue - this._currentValue;

    // Since DEFAULT_ANIMATION_SMOOTHING_FACTOR is 1.0,
    // _currentValue will become _targetValue in one step.
    // The animation loop is primarily to ensure it happens in the next paint cycle.
    this._currentValue += difference * DEFAULT_ANIMATION_SMOOTHING_FACTOR;

    if (Math.abs(this._currentValue - this._targetValue) < 0.001) {
      this._currentValue = this._targetValue; // Ensure exact snap
    }

    this.requestUpdate();

    if (this._currentValue !== this._targetValue) {
      // This path should ideally not be taken if factor is 1.0 and snapping works.
      this._animationFrameId = requestAnimationFrame(() => this._animateKnob());
    } else {
      if (this._animationFrameId !== null) {
        cancelAnimationFrame(this._animationFrameId);
        this._animationFrameId = null;
      }
    }
  }

  private _animateBackgroundEffect() {
    const difference = this._targetBackgroundEffectAlpha - this._backgroundEffectAlpha;

    if (Math.abs(difference) < 0.001) {
      this._backgroundEffectAlpha = this._targetBackgroundEffectAlpha;
      if (this._backgroundAnimationId !== null) {
        cancelAnimationFrame(this._backgroundAnimationId);
        this._backgroundAnimationId = null;
      }
      this.requestUpdate(); // Ensure final render
      return;
    }

    this._backgroundEffectAlpha += difference * BACKGROUND_EFFECT_SMOOTHING_FACTOR;
  this._arcDisplayValue = this._animatingToArcTargetValue * this._backgroundEffectAlpha; // Added line
    this.requestUpdate();

    // Check if still need to animate, to avoid scheduling a new frame if already at target.
    // (The Math.abs check above handles snapping, this ensures loop termination)
    if (this._backgroundEffectAlpha !== this._targetBackgroundEffectAlpha) {
      this._backgroundAnimationId = requestAnimationFrame(() => this._animateBackgroundEffect());
    } else {
      // If it reached target in this step, ensure ID is cleared.
      if (this._backgroundAnimationId !== null) {
         cancelAnimationFrame(this._backgroundAnimationId);
         this._backgroundAnimationId = null;
      }
    }
  }

  private handlePointerDown(e: PointerEvent) {
    this.dragStartPos = e.clientY;
    this.dragStartValue = this.value;
    document.body.classList.add('dragging');
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
    // When user starts dragging, snap background effect immediately
    this.snapBackgroundToCurrentValue();
  }

  private handlePointerMove(e: PointerEvent) {
    const delta = this.dragStartPos - e.clientY;
    this.value = this.dragStartValue + delta * 0.01;
    this.value = Math.max(0, Math.min(2, this.value));
    // As user drags, keep background snapped to current value
    this.snapBackgroundToCurrentValue();
    this.dispatchEvent(new CustomEvent<number>('input', { detail: this.value }));
  }

  private handlePointerUp(e: PointerEvent) {
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    document.body.classList.remove('dragging');
    // Optional: if you want a fade-out effect when drag ends and value is 0,
    // you could call triggerBackgroundAnimation(false) here,
    // but current logic snaps based on this.value which is fine.
  }

  private handleWheel(e: WheelEvent) {
    const delta = e.deltaY;
    this.value = this.value + delta * -0.0025;
    this.value = Math.max(0, Math.min(2, this.value));
    // Snap background on wheel event as well
    this.snapBackgroundToCurrentValue();
    this.dispatchEvent(new CustomEvent<number>('input', { detail: this.value }));
  }

  private describeArc(
    centerX: number,
    centerY: number,
    startAngle: number,
    endAngle: number,
    radius: number,
  ): string {
    const startX = centerX + radius * Math.cos(startAngle);
    const startY = centerY + radius * Math.sin(startAngle);
    const endX = centerX + radius * Math.cos(endAngle);
    const endY = centerY + radius * Math.sin(endAngle);

    const largeArcFlag = endAngle - startAngle <= Math.PI ? '0' : '1';

    return (
      `M ${startX} ${startY}` +
      `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY}`
    );
  }

  override render() {
    const rotationRange = Math.PI * 2 * 0.75;
    const minRot = -rotationRange / 2 - Math.PI / 2;
    const maxRot = rotationRange / 2 - Math.PI / 2;
    // Use _arcDisplayValue for rendering the SVG arc's length
    const rotForArc = minRot + (this._arcDisplayValue / 2) * (maxRot - minRot);
    // Use _currentValue for rendering the knob's dot indicator rotation (snappy)
    const rotForDot = minRot + (this._currentValue / 2) * (maxRot - minRot);
    const dotStyle = styleMap({
      // The indicator is placed relative to the knob's center (40,40)
      transform: `translate(40px, 40px) rotate(${rotForDot}rad)`,
    });

    // Use _currentValue for auto value check and indicator styling
    const isAutoValue = Math.abs(this._currentValue - 1.0) < 0.001;
    const indicatorColor = isAutoValue ? '#00FFFF' : '#FFFFFF'; // Cyan for auto, White otherwise
    const indicatorStrokeWidth = isAutoValue ? 3.5 : 3; // Thicker for auto

    // Use _backgroundEffectAlpha for halo base scale calculation
    // (this._backgroundEffectAlpha / 2) maps the 0-1 range of alpha
    // to a 0-0.5 factor, similar to _currentValue / 2 when _currentValue is 1.0
    let haloBaseScale = (this._backgroundEffectAlpha / 2) * (MAX_HALO_SCALE - MIN_HALO_SCALE);
    haloBaseScale += MIN_HALO_SCALE;

    // Add audioLevel modifier
    const haloDisplayScale = haloBaseScale + (this.audioLevel * HALO_LEVEL_MODIFIER);

    const haloStyle = styleMap({
      opacity: (this._backgroundEffectAlpha * 0.5).toString(),
      display: this._backgroundEffectAlpha > 0.001 ? 'block' : 'none', // Use a small threshold for display
      background: this.color,
      transform: `translate(-50%, -50%) scale(${haloDisplayScale})`,
    });

    return html`
      <div id="halo" style=${haloStyle}></div>
      <!-- Static SVG elements -->
      ${this.renderStaticSvg()}
      <!-- SVG elements that move, separated to limit redraws -->
      <svg
        viewBox="0 0 80 80"
        @pointerdown=${this.handlePointerDown}
        @wheel=${this.handleWheel}>
        <g style=${dotStyle}>
          <!-- Indicator line: longer and styled -->
          <line x1="5" y1="0" x2="25" y2="0" stroke="${indicatorColor}" stroke-width="${indicatorStrokeWidth}" stroke-linecap="round" />
        </g>
        <!-- Path for the track -->
        <path
          d=${this.describeArc(40, 40, minRot, maxRot, 34.5)}
          fill="none"
          stroke="#4A4A4A" /* Darker, subtle track for the knob range */
          stroke-opacity="0.7"
          stroke-width="2.5"
          stroke-linecap="round" />
        <!-- Path for the value fill - styled with this.color -->
        <path
          d=${this.describeArc(40, 40, minRot, rotForArc, 34.5)}
          fill="none"
          stroke=${this.color || '#707070'} /* Use halo color or default grey */
          stroke-width="3" /* Slightly thicker value arc */
          stroke-linecap="round"
          opacity="0.8" />
      </svg>
    `;
  }
  
  private renderStaticSvg() {
    // Simplified static SVG for a more DJ-like knob
    // ViewBox is 0 0 80 80. Knob centered at (40,40).
    const knobBodyColor = "#282828"; // Dark grey for knob "side"
    const knobTopColorBase = "#303030"; // Base color for the knob top
    const knobTopHighlight = "#383838"; // Subtle highlight for the center of the knob top
    const tickColor = "#666"; // Color for tick marks
    const numTicks = 5;
    const tickLength = 3; // Length of the tick mark
    const tickRadius = 28; // Radius at which ticks are placed (center of tick)

    const rotationRange = Math.PI * 2 * 0.75;
    const minRot = -rotationRange / 2 - Math.PI / 2; // Start angle for ticks
    // const maxRot = rotationRange / 2 - Math.PI / 2; // End angle for ticks (not strictly needed for loop)

    let ticksHtml = '';
    for (let i = 0; i < numTicks; i++) {
      const tickAngle = minRot + (i / (numTicks - 1)) * rotationRange;
      const x1 = 40 + (tickRadius - tickLength / 2) * Math.cos(tickAngle);
      const y1 = 40 + (tickRadius - tickLength / 2) * Math.sin(tickAngle);
      const x2 = 40 + (tickRadius + tickLength / 2) * Math.cos(tickAngle);
      const y2 = 40 + (tickRadius + tickLength / 2) * Math.sin(tickAngle);
      ticksHtml += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${tickColor}" stroke-width="1.5" stroke-linecap="round" />`;
    }

    return html`<svg viewBox="0 0 80 80">
        <defs>
          <filter id="knob-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feOffset result="offOut" in="SourceAlpha" dx="0" dy="1" />
            <feGaussianBlur result="blurOut" in="offOut" stdDeviation="1.5" />
            <feBlend in="SourceGraphic" in2="blurOut" mode="normal" />
          </filter>
          <radialGradient id="knobTopGradient" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
            <stop offset="0%" style="stop-color:${knobTopHighlight};stop-opacity:1" />
            <stop offset="100%" style="stop-color:${knobTopColorBase};stop-opacity:1" />
          </radialGradient>
        </defs>

        <!-- Knob body (cylinder side illusion) -->
        <circle cx="40" cy="41.5" r="25" fill="${knobBodyColor}" filter="url(#knob-shadow)" />

        <!-- Knob top surface -->
        <circle cx="40" cy="40" r="25" fill="url(#knobTopGradient)" />

        <!-- Static Tick Marks -->
        ${svg`${ticksHtml}`}
      </svg>`
  }

}

declare global {
  interface HTMLElementTagNameMap {
    'weight-knob': WeightKnob;
  }
}
