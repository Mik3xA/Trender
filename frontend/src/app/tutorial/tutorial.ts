import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, afterNextRender, effect, inject, signal } from '@angular/core';

import { TutorialService } from './tutorial.service';

interface Caja {
  top: number;
  left: number;
  width: number;
  height: number;
}

const MARGEN = 8;
const ANCHO_TARJETA = 320;

/**
 * Capa del tutorial: oscurece la página, enmarca el elemento [data-tutorial]
 * del paso actual y muestra una tarjeta con el texto y la navegación.
 */
@Component({
  selector: 'tr-tutorial',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'tutorial.activo() && tutorial.terminar()' },
  template: `
    @if (tutorial.activo()) {
      @if (caja(); as c) {
        <div class="tutorial-resalte" data-tutorial-resalte
             [style.top.px]="c.top" [style.left.px]="c.left" [style.width.px]="c.width" [style.height.px]="c.height"></div>
      }
      <div class="tutorial-tarjeta" role="dialog" aria-modal="false" aria-labelledby="tutorial-titulo"
           [style.top.px]="tarjeta().top" [style.left.px]="tarjeta().left">
        <p class="text-xs font-medium text-oliva">Paso {{ tutorial.indice() + 1 }} de {{ tutorial.pasos.length }}</p>
        <h3 id="tutorial-titulo" class="mt-1 text-base font-semibold">{{ tutorial.paso().titulo }}</h3>
        <p class="mt-2 text-sm leading-relaxed text-tinta-2">{{ tutorial.paso().texto }}</p>
        <div class="mt-4 flex items-center justify-between gap-2">
          <button type="button" class="text-xs text-tinta-3 hover:text-tinta" (click)="tutorial.terminar()">Saltar</button>
          <div class="flex gap-2">
            @if (tutorial.indice() > 0) {
              <button type="button" class="boton-borde !px-4 !py-2 !text-xs" (click)="tutorial.anterior()">Anterior</button>
            }
            <button type="button" class="boton-negro !px-4 !py-2 !text-xs" (click)="tutorial.siguiente()">
              {{ tutorial.esUltimo() ? 'Terminar' : 'Siguiente' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class TutorialComponent {
  protected readonly tutorial = inject(TutorialService);
  private readonly documento = inject(DOCUMENT);
  protected readonly caja = signal<Caja | null>(null);
  protected readonly tarjeta = signal({ top: 0, left: 0 });

  constructor() {
    const medir = () => this.medir();
    afterNextRender(() => {
      const vista = this.documento.defaultView;
      vista?.addEventListener('resize', medir);
      vista?.addEventListener('scroll', medir, { passive: true });
    });
    inject(DestroyRef).onDestroy(() => {
      const vista = this.documento.defaultView;
      vista?.removeEventListener('resize', medir);
      vista?.removeEventListener('scroll', medir);
    });

    // Al cambiar de paso: llevar el objetivo a la vista y medirlo cuando termine el desplazamiento.
    effect(() => {
      if (!this.tutorial.activo()) return;
      const objetivo = this.tutorial.paso().objetivo;
      queueMicrotask(() => {
        this.elemento(objetivo)?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
        this.medir();
        setTimeout(() => this.medir(), 350);
      });
    });
  }

  private elemento(objetivo: string): HTMLElement | null {
    return this.documento.querySelector<HTMLElement>(`[data-tutorial="${objetivo}"]`);
  }

  private medir(): void {
    if (!this.tutorial.activo()) return;
    const vista = this.documento.defaultView;
    const anchoVista = vista?.innerWidth ?? 1024;
    const altoVista = vista?.innerHeight ?? 768;
    const el = this.elemento(this.tutorial.paso().objetivo);
    const r = el?.getBoundingClientRect();
    if (!r || r.width === 0) {
      this.caja.set(null);
      this.tarjeta.set({ top: altoVista / 2 - 90, left: anchoVista / 2 - ANCHO_TARJETA / 2 });
      return;
    }
    const caja = { top: r.top - MARGEN, left: r.left - MARGEN, width: r.width + MARGEN * 2, height: r.height + MARGEN * 2 };
    this.caja.set(caja);

    // Tarjeta a la derecha del objetivo si cabe; si no, debajo, encima o dentro.
    const limitarX = (x: number) => Math.min(Math.max(16, x), anchoVista - ANCHO_TARJETA - 16);
    const limitarY = (y: number) => Math.min(Math.max(16, y), altoVista - 220);
    let top: number;
    let left: number;
    if (caja.left + caja.width + 16 + ANCHO_TARJETA < anchoVista) {
      left = caja.left + caja.width + 16;
      top = limitarY(caja.top);
    } else if (caja.top + caja.height + 220 < altoVista) {
      left = limitarX(caja.left);
      top = caja.top + caja.height + 16;
    } else if (caja.top - 220 > 0) {
      left = limitarX(caja.left);
      top = caja.top - 220;
    } else {
      left = limitarX(caja.left + caja.width - ANCHO_TARJETA - 16);
      top = limitarY(caja.top + 16);
    }
    this.tarjeta.set({ top, left });
  }
}
