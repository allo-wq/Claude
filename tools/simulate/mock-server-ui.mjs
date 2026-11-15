export const ui = { shown: [], answers: [] };
class Form {
  constructor(kind) { this.kind = kind; this.buttons = []; }
  title(t) { this._title = t; return this; }
  body(t) { this._body = t; return this; }
  button(text, icon) { this.buttons.push({ text, icon }); return this; }
  button1(t) { this.buttons[0] = { text: t }; return this; }
  button2(t) { this.buttons[1] = { text: t }; return this; }
  async show(player) { ui.shown.push(this); const a = ui.answers.shift(); return a === undefined ? { canceled: true } : { canceled: false, selection: a }; }
}
export class ActionFormData extends Form { constructor() { super("action"); } }
export class MessageFormData extends Form { constructor() { super("message"); } }
