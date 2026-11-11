import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  afterNextRender,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';

import { MotorAvatar } from '../motor-3d/motor-avatar';
import { Medidas } from '../probador/cuerpo';
import { PrendaVirtual } from '../probador/prendas';

/** Visor WebGL del avatar. Toda la lógica 3D vive en MotorAvatar. */
@Component({
  selector: 'tr-visor-3d',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './visor-3d.html',
})
export class Visor3dComponent implements OnDestroy {
  readonly medidas = input.required<Medidas>();
  readonly conjunto = input<PrendaVirtual[]>([]);
  readonly tono = input('maniqui');

  protected readonly webglDisponible = signal(true);
  protected readonly autoRotar = signal(false);

  private readonly contenedor = viewChild.required<ElementRef<HTMLDivElement>>('contenedor');
  private readonly lienzo = viewChild.required<ElementRef<HTMLCanvasElement>>('lienzo');
  private readonly zone = inject(NgZone);
  private motor: MotorAvatar | null = null;
  private observador: ResizeObserver | null = null;

  constructor() {
    afterNextRender(() => this.iniciar());
    effect(() => {
      const medidas = this.medidas();
      const conjunto = this.conjunto();
      this.motor?.actualizar(medidas, conjunto);
    });
    effect(() => this.motor?.setAutoRotar(this.autoRotar()));
    effect(() => {
      const tono = this.tono();
      this.motor?.setTono(tono);
    });
  }

  restablecerCamara(): void {
    this.motor?.restablecerCamara();
  }

  alternarRotacion(): void {
    this.autoRotar.update((v) => !v);
  }

  ngOnDestroy(): void {
    this.observador?.disconnect();
    this.motor?.destruir();
    this.motor = null;
  }

  private iniciar(): void {
    try {
      // El bucle de render no necesita detección de cambios de Angular.
      this.motor = this.zone.runOutsideAngular(() => new MotorAvatar(this.lienzo().nativeElement));
    } catch (error) {
      console.warn('WebGL no disponible:', error);
      this.webglDisponible.set(false);
      return;
    }
    const host = this.contenedor().nativeElement;
    const ajustar = () => this.motor?.redimensionar(host.clientWidth, host.clientHeight);
    ajustar();
    if (typeof ResizeObserver !== 'undefined') {
      this.observador = new ResizeObserver(ajustar);
      this.observador.observe(host);
    }
    this.motor.setTono(this.tono());
    this.motor.actualizar(this.medidas(), this.conjunto());
  }
}
