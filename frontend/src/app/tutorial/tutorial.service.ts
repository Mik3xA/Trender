import { Injectable, computed, signal } from '@angular/core';

export interface PasoTutorial {
  /** Valor del atributo data-tutorial del elemento que se resalta. */
  objetivo: string;
  titulo: string;
  texto: string;
}

export const PASOS_TUTORIAL: PasoTutorial[] = [
  {
    objetivo: 'apartados',
    titulo: 'Elige el apartado',
    texto: 'Mujer y Hombre son probadores independientes: cada uno guarda su propio cuerpo, su conjunto y su armario.',
  },
  {
    objetivo: 'cuerpo',
    titulo: 'Ajusta tu cuerpo',
    texto: 'Indica altura, peso y tipo de cuerpo (Fit, Delgado, Normal o Sobrepeso). Si conoces tus medidas, añádelas en "Medidas exactas".',
  },
  {
    objetivo: 'importar',
    titulo: 'Trae prendas de tu tienda',
    texto: 'Pega el link de un producto de Amazon, Mercado Libre, Nike, Zara, H&M u otra tienda. Analizamos la foto, el tipo de prenda y su color.',
  },
  {
    objetivo: 'armario',
    titulo: 'Tu armario',
    texto: 'Las prendas importadas aparecen aquí. Toca una para probártela; si la clasificamos mal, pasa el cursor y corrige su categoría.',
  },
  {
    objetivo: 'visor',
    titulo: 'Mira cómo te queda',
    texto: 'Arrastra para girar el avatar y usa la rueda o el gesto de pellizco para acercarte. Combina hasta seis prendas.',
  },
  {
    objetivo: 'talla',
    titulo: 'Talla recomendada',
    texto: 'Con tus medidas calculamos la talla de cada prenda puesta. Puedes repetir este tutorial con el botón "?".',
  },
];

const CLAVE_TUTORIAL = 'trender.tutorial';

/** Estado del recorrido guiado del probador. Recuerda si ya se completó. */
@Injectable({ providedIn: 'root' })
export class TutorialService {
  readonly pasos = PASOS_TUTORIAL;
  readonly activo = signal(false);
  readonly indice = signal(0);
  readonly paso = computed(() => this.pasos[this.indice()]);
  readonly esUltimo = computed(() => this.indice() === this.pasos.length - 1);

  /** true si la persona ya vio o saltó el tutorial alguna vez. */
  visto(): boolean {
    try {
      return localStorage.getItem(CLAVE_TUTORIAL) === 'visto';
    } catch {
      return false;
    }
  }

  iniciar(): void {
    this.indice.set(0);
    this.activo.set(true);
  }

  /** Arranca solo la primera vez. */
  iniciarSiEsNuevo(): void {
    if (!this.visto() && !this.activo()) this.iniciar();
  }

  siguiente(): void {
    if (this.esUltimo()) this.terminar();
    else this.indice.update((i) => i + 1);
  }

  anterior(): void {
    this.indice.update((i) => Math.max(0, i - 1));
  }

  terminar(): void {
    this.activo.set(false);
    try {
      localStorage.setItem(CLAVE_TUTORIAL, 'visto');
    } catch {
      /* almacenamiento no disponible */
    }
  }
}
