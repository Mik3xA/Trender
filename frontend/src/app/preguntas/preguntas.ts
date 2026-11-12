import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

export interface Pregunta {
  pregunta: string;
  respuesta: string;
}

export const PREGUNTAS: Pregunta[] = [
  {
    pregunta: '¿Cómo funciona la prueba?',
    respuesta:
      'Subes una foto tuya de cuerpo entero y fotos de tu ropa. Eliges hasta cuatro prendas (una por parte del cuerpo) y una inteligencia artificial genera una foto tuya con esa ropa puesta, respetando tu cara, tu cuerpo, tu pose y el fondo.',
  },
  {
    pregunta: '¿Necesito crear una cuenta?',
    respuesta:
      'No. Al entrar te asignamos una sesión de invitado automáticamente. Tu armario, tus fotos y tus pruebas quedan guardados para esa sesión, sin correo ni contraseña.',
  },
  {
    pregunta: '¿Puedo subir varias prendas a la vez?',
    respuesta:
      'Sí, hasta ocho fotos de una vez. Cada foto se analiza por separado y aparece como una prenda en tu armario. Si es una sola foto, al terminar se abre su cuestionario.',
  },
  {
    pregunta: '¿Y si subo un outfit completo?',
    respuesta:
      'Marca "Outfit completo" antes de subir o, si detectamos varias prendas en la foto, te lo preguntamos. Al probarlo eliges si usar todo o solo la parte de arriba, el pantalón o los zapatos.',
  },
  {
    pregunta: '¿Para qué sirve el cuestionario de la prenda?',
    respuesta:
      'Le dice a la IA cómo es la prenda puesta: qué es exactamente (camisa, sudadera, pants…), si te queda ajustada, regular u holgada, el largo, la manga y si tiene capucha o cuello. Se abre con el botón de ajustes de cada prenda.',
  },
  {
    pregunta: '¿Cómo quito una prenda de mi armario?',
    respuesta:
      'Con el botón de la papelera de su tarjeta: tócalo una vez y otra para confirmar. También puedes borrar tus fotos y tus pruebas desde sus miniaturas.',
  },
  {
    pregunta: 'Aparece "Vista previa sin IA"',
    respuesta:
      'El servidor no tiene configurada una IA, así que las prendas se superponen sobre tu foto de forma aproximada. Para fotos realistas, quien administra Trender debe poner GEMINI_API_KEY (o FASHN_API_KEY) en el archivo .env del backend.',
  },
  {
    pregunta: '¿Qué pasa con mis fotos?',
    respuesta:
      'Se guardan en una carpeta privada del servidor y solo se muestran con tu sesión; antes de subirlas les quitamos la ubicación y otros metadatos. Para generar la prueba se envían al proveedor de IA configurado. Puedes borrarlas cuando quieras.',
  },
  {
    pregunta: 'La prenda no se recortó bien',
    respuesta:
      'Pasa cuando la prenda y el fondo tienen colores parecidos o la prenda está doblada. Desde su cuestionario usa "Cambiar foto" con un fondo que contraste; si no se puede recortar, la IA usa la foto completa.',
  },
  {
    pregunta: 'Aparece "Sin conexión con el servidor"',
    respuesta:
      'El probador necesita el backend. En la carpeta raíz del proyecto ejecuta "npm install" y después "npm run dev".',
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
