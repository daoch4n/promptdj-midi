import { css, html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { map } from 'lit/directives/map.js';

export interface DJStyleSelectorOption {
  value: string;
  label: string;
}

@customElement('dj-style-selector')
export class DJStyleSelector extends LitElement {
  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 5px;
      font-family: 'Roboto', sans-serif; /* Example font */
    }
    .option {
      background-color: #333;
      color: #fff;
      border: 1px solid #555;
      border-radius: 4px;
      padding: 8px 12px;
      text-align: center;
      cursor: pointer;
      transition: background-color 0.2s, box-shadow 0.2s;
      font-size: 0.9em;
    }
    .option:hover {
      background-color: #444;
    }
    .option.selected {
      background-color: #007bff; /* Bright blue for selected */
      box-shadow: 0 0 8px #007bff, 0 0 10px #007bff;
      color: #fff;
      font-weight: bold;
    }
  `;

  @property({ type: Array })
  options: DJStyleSelectorOption[] = [];

  @property({ type: String })
  value: string = '';

  private _handleOptionClick(optionValue: string) {
    this.value = optionValue;
    this.dispatchEvent(
      new CustomEvent('change', {
        detail: this.value,
        bubbles: true,
        composed: true,
      })
    );
  }

  override render() {
    return html`
      ${map(
        this.options,
        (option) => html`
          <div
            class="option ${option.value === this.value ? 'selected' : ''}"
            @click=${() => this._handleOptionClick(option.value)}
          >
            ${option.label}
          </div>
        `
      )}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dj-style-selector': DJStyleSelector;
  }
}
