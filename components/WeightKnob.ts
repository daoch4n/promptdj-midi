/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { css, html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

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
    /* #halo styling removed as the element is no longer used
    #halo {
      position: absolute;
      z-index: -1;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      will-change: transform;
    }
    */
  `;

  @property({ type: Number }) value = 0;
  // @property({ type: String }) color = '#000'; // Color was for halo
  @property({ type: Number }) audioLevel = 0; // Was for halo

  private dragStartPos = 0;
  private dragStartValue = 0;

  constructor() {
    super();
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
  }

  private handlePointerDown(e: PointerEvent) {
    this.dragStartPos = e.clientY;
    this.dragStartValue = this.value;
    document.body.classList.add('dragging');
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
  }

  private handlePointerMove(e: PointerEvent) {
    const delta = this.dragStartPos - e.clientY;
    this.value = this.dragStartValue + delta * 0.01;
    this.value = Math.max(0, Math.min(2, this.value));
    this.dispatchEvent(new CustomEvent<number>('input', { detail: this.value }));
  }

  private handlePointerUp(e: PointerEvent) {
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    document.body.classList.remove('dragging');
  }

  private handleWheel(e: WheelEvent) {
    const delta = e.deltaY;
    this.value = this.value + delta * -0.0025;
    this.value = Math.max(0, Math.min(2, this.value));
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
    const rot = minRot + (this.value / 2) * (maxRot - minRot);
    const dotStyle = styleMap({
      // The indicator is placed relative to the knob's center (40,40)
      transform: `translate(40px, 40px) rotate(${rot}rad)`,
    });

    // Halo logic removed
    // let scale = (this.value / 2) * (MAX_HALO_SCALE - MIN_HALO_SCALE);
    // scale += MIN_HALO_SCALE;
    // scale += this.audioLevel * HALO_LEVEL_MODIFIER;

    // const haloStyle = styleMap({
    //   display: this.value > 0 ? 'block' : 'none',
    //   background: this.color,
    //   transform: `scale(${scale})`,
    // });

    return html`
      <!-- Halo div removed -->
      <!-- <div id="halo" style=${haloStyle}></div> -->
      <!-- Static SVG elements -->
      ${this.renderStaticSvg()}
      <!-- SVG elements that move, separated to limit redraws -->
      <svg
        viewBox="0 0 80 80"
        @pointerdown=${this.handlePointerDown}
        @wheel=${this.handleWheel}>
        <g style=${dotStyle}>
          <!-- Changed from circle to a line for the indicator -->
          <line x1="8" y1="0" x2="23" y2="0" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" />
        </g>
        <!-- The following paths were part of the old knob's value indication, replacing with simpler visual feedback or removing if not needed for DJ aesthetic -->
        <!-- Path for the track -->
        <path
          d=${this.describeArc(40, 40, minRot, maxRot, 34.5)}
          fill="none"
          stroke="#4A4A4A" /* Darker, subtle track for the knob range */
          stroke-opacity="0.7"
          stroke-width="2.5" /* Slightly thinner */
          stroke-linecap="round" />
        <!-- Path for the value fill - might be kept or altered if DJ knobs sometimes have this kind of value ring -->
        <path
          d=${this.describeArc(40, 40, minRot, rot, 34.5)}
          fill="none"
          stroke="#707070" /* Lighter grey for the value arc, but still subtle */
          stroke-width="2.5" /* Slightly thinner */
          stroke-linecap="round" />
      </svg>
    `;
  }
  
  private renderStaticSvg() {
    // Simplified static SVG for a more DJ-like knob
    // ViewBox is 0 0 80 80. Knob centered at (40,40).
    const knobBodyColor = "#282828"; // Dark grey for knob "side"
    const knobTopColorBase = "#303030"; // Base color for the knob top
    const knobTopHighlight = "#383838"; // Subtle highlight for the center of the knob top

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

      </svg>`
  }

}

declare global {
  interface HTMLElementTagNameMap {
    'weight-knob': WeightKnob;
  }
}
