// Stand-in for @minecraft/server-ui: forms answer from a queue the test fills.

/** Answers handed to the next forms shown, in order. Empty queue = cancelled. */
export const answers = [];
/** Every form that was shown, for assertions. */
export const shown = [];

class Form {
  constructor() {
    this.buttons = [];
  }
  title(text) {
    this.titleText = text;
    return this;
  }
  body(text) {
    this.bodyText = text;
    return this;
  }
  async show() {
    shown.push(this);
    const selection = answers.shift();
    return selection === undefined ? { canceled: true } : { canceled: false, selection };
  }
}

export class ActionFormData extends Form {
  button(text) {
    this.buttons.push(text);
    return this;
  }
}

export class MessageFormData extends Form {
  button1(text) {
    this.buttons[0] = text;
    return this;
  }
  button2(text) {
    this.buttons[1] = text;
    return this;
  }
}
