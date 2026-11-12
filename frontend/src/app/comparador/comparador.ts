import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

/**
 * Antes / después: la foto de la prenda (izquierda) y la misma prenda puesta en
 * el avatar (derecha). Se arrastra el divisor (o se usan las flechas del teclado).
 */
@Component({
  selector: 'tr-comparador',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './comparador.html',
})
export class ComparadorComponent {
  /** Posición del divisor en % (0 = todo "después", 100 = todo "antes"). */
  readonly posicion = signal(52);
  private arrastrando = false;

  empezar(evento: PointerEvent): void {
    this.arrastrando = true;
    (evento.currentTarget as HTMLElement).setPointerCapture?.(evento.pointerId);
    this.mover(evento);
  }

  mover(evento: PointerEvent): void {
    if (!this.arrastrando) return;
    const caja = (evento.currentTarget as HTMLElement).getBoundingClientRect();
    if (!caja.width) return;
    this.fijar(((evento.clientX - caja.left) / caja.width) * 100);
  }

  soltar(): void {
    this.arrastrando = false;
  }

  teclado(evento: KeyboardEvent): void {
    const paso = evento.shiftKey ? 10 : 3;
    if (evento.key === 'ArrowLeft') this.fijar(this.posicion() - paso);
    else if (evento.key === 'ArrowRight') this.fijar(this.posicion() + paso);
    else return;
    evento.preventDefault();
  }

  fijar(valor: number): void {
    this.posicion.set(Math.round(Math.min(95, Math.max(5, valor))));
  }
}
