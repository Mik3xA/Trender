import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

export interface Pregunta {
  pregunta: string;
  respuesta: string;
}

export const PREGUNTAS: Pregunta[] = [
  {
    pregunta: '¿Necesito crear una cuenta?',
    respuesta:
      'No. Al entrar te asignamos una sesión de invitado automáticamente. Tu armario y tus medidas quedan guardados en este navegador y en el servidor, sin correo ni contraseña.',
  },
  {
    pregunta: '¿Cómo subo mi ropa?',
    respuesta:
      'En "Agregar prenda" elige o arrastra hasta seis fotos a la vez. Si quieres, antes marca qué vas a subir (sudadera, pants, chamarra…). Quitamos el fondo, analizamos la prenda y la guardamos en tu armario.',
  },
  {
    pregunta: '¿Cómo sabe Trender qué tipo de prenda es?',
    respuesta:
      'Analizamos la silueta de la foto: mangas, escote, capucha, cierre al frente, dos perneras, puños de pants, una falda que se abre hacia abajo, la forma de un zapato… y el nombre si lo escribiste. Si dudamos, te lo preguntamos.',
  },
  {
    pregunta: '¿Para qué sirve el cuestionario de la prenda?',
    respuesta:
      'Le dice al avatar cómo es la prenda puesta: qué es exactamente (camisa, sudadera, pants…), si te queda ajustada, regular u holgada, el largo, la manga y si tiene capucha o cuello. Cada respuesta cambia el avatar al instante. Se abre al subir una foto o con la "i" de cada prenda.',
  },
  {
    pregunta: '¿Qué tan exacta es la talla recomendada?',
    respuesta:
      'Es una estimación a partir de tu altura, peso, tipo de cuerpo y, si las indicas, tus medidas de pecho, cintura y cadera, comparadas con tablas de tallas habituales. Cada marca talla distinto.',
  },
  {
    pregunta: 'La prenda no se recortó bien',
    respuesta:
      'Pasa cuando la prenda y el fondo tienen colores parecidos (una playera blanca sobre una pared blanca) o cuando la prenda está doblada. Vuelve a tomar la foto con un fondo que contraste y la prenda extendida; con "Añadir foto" puedes cambiarla sin perder sus respuestas.',
  },
  {
    pregunta: '¿Por qué están separados Mujer y Hombre?',
    respuesta:
      'Cada apartado tiene su propio cuerpo, su conjunto y su armario. Así puedes preparar looks para ti y para otra persona sin que se mezclen las prendas ni las medidas.',
  },
  {
    pregunta: 'Aparece "Sin conexión con el servidor"',
    respuesta:
      'El probador necesita el backend para analizar las fotos y guardar tu armario. En la carpeta raíz del proyecto ejecuta "npm install" y después "npm run dev". Mientras tanto puedes usar los básicos.',
  },
  {
    pregunta: '¿Qué pasa con mis datos?',
    respuesta:
      'Solo guardamos lo necesario: tus medidas y el recorte de cada prenda (la foto original no se guarda y se le quitan los datos de ubicación antes de subirla). No pedimos fotos tuyas y puedes borrar cualquier prenda cuando quieras.',
  },
  {
    pregunta: '¿Funciona en el celular?',
    respuesta:
      'Sí. Puedes tomar la foto directamente con la cámara; en pantallas pequeñas el panel se coloca debajo del avatar. Arrastra con un dedo para girarlo y pellizca para acercarte.',
  },
];

/** Preguntas frecuentes en acordeón; solo una abierta a la vez. */
@Component({
  selector: 'tr-preguntas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="border-t border-linea">
      @for (p of preguntas; track p.pregunta; let i = $index) {
        <div class="pregunta">
          <h3>
            <button type="button" [id]="'pregunta-' + i" [attr.aria-expanded]="abierta() === i" [attr.aria-controls]="'respuesta-' + i"
                    (click)="alternar(i)">
              {{ p.pregunta }}
              <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-linea text-tinta-2 transition-transform"
                    [class.rotate-45]="abierta() === i" aria-hidden="true">+</span>
            </button>
          </h3>
          @if (abierta() === i) {
            <p class="respuesta" [id]="'respuesta-' + i" role="region" [attr.aria-labelledby]="'pregunta-' + i">{{ p.respuesta }}</p>
          }
        </div>
      }
    </div>
  `,
})
export class PreguntasComponent {
  protected readonly preguntas = PREGUNTAS;
  protected readonly abierta = signal<number | null>(0);

  alternar(i: number): void {
    this.abierta.update((actual) => (actual === i ? null : i));
  }
}
