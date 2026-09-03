// Full-screen pairing display (PROJECT.md §5.9):
//
//        MEMORIES
//      Pairing code:
//           7429
//   Open Memories on your phone/computer
//        and enter this code.
export class PairingScreen {
  private root: HTMLDivElement;
  private codeEl: HTMLDivElement;

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    Object.assign(this.root.style, {
      position: 'absolute',
      inset: '0',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0a0a0c',
      color: '#eee',
      fontFamily: 'sans-serif',
      textAlign: 'center',
      gap: '1.5vh',
    } as CSSStyleDeclaration);

    const title = document.createElement('div');
    title.textContent = 'MEMORIES';
    Object.assign(title.style, { fontSize: '3vw', letterSpacing: '0.3em', opacity: '0.8' });

    const label = document.createElement('div');
    label.textContent = 'Pairing code:';
    Object.assign(label.style, { fontSize: '1.8vw', opacity: '0.6', marginTop: '4vh' });

    this.codeEl = document.createElement('div');
    Object.assign(this.codeEl.style, { fontSize: '7vw', fontWeight: '700', letterSpacing: '0.15em' });

    const help = document.createElement('div');
    help.textContent = 'Open Memories on your phone or computer and enter this code.';
    Object.assign(help.style, { fontSize: '1.4vw', opacity: '0.5', marginTop: '4vh', maxWidth: '60vw' });

    this.root.append(title, label, this.codeEl, help);
    container.appendChild(this.root);
  }

  setCode(code: string): void {
    this.codeEl.textContent = code;
  }

  remove(): void {
    this.root.remove();
  }
}
