/**
 * Value Object representing a deterministic interactive element reference for LLMs.
 */
export interface ElementRefProps {
  ref: number;
  role: string;
  name: string;
  selector?: string;
  tag?: string;
  type?: string;
  placeholder?: string;
  value?: string;
  disabled?: boolean;
  required?: boolean;
  checked?: boolean;
}

export class ElementRef {
  readonly ref: number;
  readonly role: string;
  readonly name: string;
  readonly selector?: string;
  readonly tag?: string;
  readonly type?: string;
  readonly placeholder?: string;
  readonly value?: string;
  readonly disabled?: boolean;
  readonly required?: boolean;
  readonly checked?: boolean;

  constructor(props: ElementRefProps) {
    this.ref = props.ref;
    this.role = props.role;
    this.name = props.name;
    this.selector = props.selector;
    this.tag = props.tag;
    this.type = props.type;
    this.placeholder = props.placeholder;
    this.value = props.value;
    this.disabled = props.disabled ?? false;
    this.required = props.required ?? false;
    this.checked = props.checked;
  }

  /**
   * Formats element reference for token-efficient LLM prompt display.
   * Example: [1] button "Submit"
   * Example: [2] textbox "Email" (required, value="foo@bar.com")
   */
  toPromptString(): string {
    const flags: string[] = [];
    if (this.type && this.type !== 'text') flags.push(`type=${this.type}`);
    if (this.placeholder) flags.push(`placeholder="${this.placeholder}"`);
    if (this.value) flags.push(`value="${this.value}"`);
    if (this.required) flags.push('required');
    if (this.disabled) flags.push('disabled');
    if (this.checked !== undefined) flags.push(this.checked ? 'checked' : 'unchecked');

    const flagStr = flags.length > 0 ? ` (${flags.join(', ')})` : '';
    const label = this.name ? ` "${this.name}"` : '';
    return `[${this.ref}] ${this.role}${label}${flagStr}`;
  }

  toJSON() {
    return {
      ref: this.ref,
      role: this.role,
      name: this.name,
      selector: this.selector,
      tag: this.tag,
      type: this.type,
      placeholder: this.placeholder,
      value: this.value,
      disabled: this.disabled,
      required: this.required,
      checked: this.checked,
    };
  }
}
