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
    texto: 'Mujer y Hombre son probadores independientes: cada uno tiene su modelo, su conjunto y su armario.',
  },
  {
    objetivo: 'persona',
    titulo: 'Ajusta tu modelo',
    texto: 'Tipo de cuerpo, altura, peso y tono. Debajo ves lo que lleva puesto y la talla recomendada.',
  },
  {
    objetivo: 'importar',
    titulo: 'Sube fotos de tu ropa',
    texto: 'Varias a la vez, una prenda por foto. Si quieres, dinos antes qué es. Quitamos el fondo y detectamos el tipo, el color y los detalles.',
  },
  {
    objetivo: 'armario',
    titulo: 'Tu armario',
    texto: 'Toca una prenda para ponérsela al modelo (una por parte del cuerpo). Con el botón de ajustes respondes su cuestionario y con la papelera la quitas.',
  },
  {
    objetivo: 'resultado',
    titulo: 'Mira cómo queda',
    texto: 'Arrastra para girar el modelo y usa la rueda para acercarte. Repite este tutorial con el botón "?".',
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
