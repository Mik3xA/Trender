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
    pregunta: '¿De qué tiendas puedo importar prendas?',
    respuesta:
      'Tenemos lectores específicos para Amazon, Mercado Libre, Nike, Zara y H&M, y uno general que funciona con la mayoría de tiendas en línea. Basta con pegar el link de la página del producto.',
  },
  {
    pregunta: '¿Cómo sabe Trender qué tipo de prenda es?',
    respuesta:
      'Leemos el nombre, la categoría y la descripción del producto, y elegimos la foto más limpia. Con eso decidimos si es una prenda superior, inferior, vestido o calzado. Si dudamos, te preguntamos y puedes corregirla en el armario.',
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
