import { Modal, Notice, Setting, type App } from 'obsidian';

export class ScaleModal extends Modal {
  constructor(app: App, private apply: (percent: number) => void) { super(app); }
  onOpen(): void {
    this.setTitle('Scale selected images');
    let percent = '100';
    new Setting(this.contentEl).setName('Scale (%)').setDesc('Resize images and their spacing together.').addText(text => text.setValue(percent).onChange(value => percent = value));
    new Setting(this.contentEl).addButton(button => button.setButtonText('Apply').setCta().onClick(() => {
      const value = Number(percent);
      if (!Number.isFinite(value) || value <= 0 || value > 1000) { new Notice('Enter a scale greater than 0% and no more than 1000%.'); return; }
      this.apply(value); this.close();
    }));
  }
  onClose(): void { this.contentEl.empty(); }
}

export class NoteModal extends Modal {
  constructor(app: App, private create: (name: string) => Promise<void>) { super(app); }
  onOpen(): void {
    this.setTitle('Create note in canvas');
    let name = '';
    const input = new Setting(this.contentEl).setName('Note name').addText(text => text.setPlaceholder('Untitled').onChange(value => name = value));
    new Setting(this.contentEl).addButton(button => button.setButtonText('Create').setCta().onClick(async () => {
      button.setDisabled(true);
      try { await this.create(name || 'Untitled'); this.close(); }
      catch (error) { new Notice(error instanceof Error ? error.message : 'Could not create the note.'); button.setDisabled(false); }
    }));
    input.controlEl.querySelector('input')?.focus();
  }
  onClose(): void { this.contentEl.empty(); }
}
