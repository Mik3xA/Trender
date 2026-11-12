import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

export interface Pregunta {
  pregunta: string;
  respuesta: string;
}

export const PREGUNTAS: Pregunta[] = [
  {
    pregunta: '¿Cómo funciona el probador?',
    respuesta:
      'Subes fotos de tu ropa. Trender quita el fondo, reconoce qué prenda es y la reconstruye en 3D con su color y sus detalles. Luego tocas las prendas de tu armario para ponérselas a un modelo ajustado a tu cuerpo.',
  },
  {
    pregunta: '¿Necesito crear una cuenta?',
    respuesta:
      'No. Al entrar te asignamos una sesión de invitado automáticamente. Tu armario queda guardado para esa sesión, sin correo ni contraseña.',
  },
  {
    pregunta: '¿Puedo subir varias prendas a la vez?',
    respuesta:
      'Sí, hasta ocho fotos de una vez, una prenda por foto. Cada foto se analiza por separado, aparece en tu armario y el modelo se la pone al terminar.',
  },
  {
    pregunta: '¿Qué prendas puedo probar?',
    respuesta:
      'Playeras, camisas, blusas, tops, suéteres, sudaderas, chamarras, sacos, abrigos, pantalones, jeans, pants, leggings, shorts, faldas, vestidos, tenis, zapatos, botas y sandalias.',
  },
  {
    pregunta: '¿Para qué sirve el cuestionario de la prenda?',
    respuesta:
      'Afina cómo se ve en el modelo: qué es exactamente (camisa, sudadera, chamarra…), si te queda ajustada, regular u holgada, el largo, la manga, si tiene capucha o cuello, y si quieres ver su color y tejido o la foto proyectada.',
  },
  {
    pregunta: '¿Por qué están separados Mujer y Hombre?',
    respuesta:
      'Cada apartado tiene su propio modelo, con proporciones distintas, y su propio armario. Así no se mezclan las prendas ni lo que lleva puesto cada uno.',
  },
  {
    pregunta: '¿Cómo quito una prenda de mi armario?',
    respuesta: 'Con el botón de la papelera de su tarjeta: tócalo una vez y otra para confirmar.',
  },
  {
    pregunta: '¿Qué tan exacta es la talla recomendada?',
    respuesta:
      'Es una estimación a partir de la altura, el peso y el tipo de cuerpo del modelo, comparados con tablas de tallas habituales. Cada marca talla distinto.',
  },
  {
    pregunta: 'La prenda no se recortó bien',
    respuesta:
      'Pasa cuando la prenda y el fondo tienen colores parecidos o la prenda está doblada. Desde su cuestionario usa "Cambiar foto" con un fondo que contraste.',
  },
  {
    pregunta: 'Aparece "Sin conexión con el servidor"',
    respuesta: 'El probador necesita el backend. En la carpeta raíz del proyecto ejecuta "npm install" y después "npm run dev".',
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
