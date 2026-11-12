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
    pregunta: '¿Puedo subir fotos de mi propia ropa?',
    respuesta:
      'Sí, es la forma más fiable. Elige "Subir foto" y arrastra una o varias imágenes: detectamos si es prenda superior, inferior, vestido o calzado, su color y estampado, recortamos el fondo y la guardamos en tu armario. Funciona mejor con la prenda sola, extendida o en gancho, sobre un fondo liso.',
  },
  {
    pregunta: '¿De qué tiendas puedo importar prendas?',
    respuesta:
      'Tenemos lectores para Amazon, Mercado Libre, Nike, Zara y H&M, y uno general para la mayoría de tiendas. Algunas tiendas bloquean la lectura automática: en ese caso guardamos la prenda con los datos del link y puedes añadirle una foto o captura con "Añadir foto".',
  },
  {
    pregunta: '¿Cómo sabe Trender qué tipo de prenda es?',
    respuesta:
      'Analizamos la silueta de la foto: mangas, escote, dos perneras, una falda que se abre hacia abajo, la forma de un zapato… y, si lo hay, el texto del producto o el nombre que escribiste. Con el botón "i" de cada prenda ves el análisis y puedes corregir el tipo.',
  },
  {
    pregunta: '¿Qué tan exacta es la talla recomendada?',
    respuesta:
      'Es una estimación a partir de tu altura, peso, tipo de cuerpo y, si las indicas, tus medidas de pecho, cintura y cadera, comparadas con tablas de tallas habituales. Cada marca talla distinto, así que revisa también la guía de la tienda.',
  },
  {
    pregunta: '¿Por qué están separados Mujer y Hombre?',
    respuesta:
      'Cada apartado tiene su propio cuerpo, su conjunto y su armario. Así puedes preparar looks para ti y para otra persona sin que se mezclen las prendas ni las medidas.',
  },
  {
    pregunta: 'La prenda se ve distinta a la foto de la tienda',
    respuesta:
      'Proyectamos la foto real sobre una prenda 3D genérica de su tipo, así que el color y el estampado son fieles pero el corte es aproximado. Las fotos con fondo liso dan el mejor resultado.',
  },
  {
    pregunta: 'Aparece "Sin conexión con el servidor"',
    respuesta:
      'El probador necesita el backend para importar prendas y guardar tu armario. En la carpeta raíz del proyecto ejecuta "npm install" y después "npm run dev". Mientras tanto puedes usar los básicos.',
  },
  {
    pregunta: '¿Qué pasa con mis datos?',
    respuesta:
      'Solo guardamos lo necesario para el probador: tus medidas y las prendas que importas. No pedimos fotos tuyas ni datos personales, y puedes borrar cualquier prenda del armario cuando quieras.',
  },
  {
    pregunta: '¿Funciona en el celular?',
    respuesta:
      'Sí. En pantallas pequeñas el panel se coloca debajo del avatar; arrastra con un dedo para girarlo y pellizca para acercarte. Necesitas un navegador con WebGL activo.',
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
