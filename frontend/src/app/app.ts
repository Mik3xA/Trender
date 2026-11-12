import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

import { ComparadorComponent } from './comparador/comparador';
import { EstudioComponent } from './estudio/estudio';
import { PreguntasComponent } from './preguntas/preguntas';
import { TutorialComponent } from './tutorial/tutorial';
import { TutorialService } from './tutorial/tutorial.service';

interface Bloque {
  titulo: string;
  texto: string;
  icono: string;
  grande?: boolean;
  oscura?: boolean;
}

const icono = (d: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" class="h-14 w-14"><path stroke-linecap="round" stroke-linejoin="round" d="${d}"/></svg>`;

/** Página: portada, probador con IA, cómo funciona, outfits, características, consejos, privacidad y preguntas. */
@Component({
  selector: 'app-root',
  imports: [ComparadorComponent, EstudioComponent, PreguntasComponent, TutorialComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class AppComponent {
  private readonly tutorial = inject(TutorialService);
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly anio = new Date().getFullYear();

  protected readonly CIFRAS = [
    { valor: '20+', etiqueta: 'tipos de prenda' },
    { valor: '8', etiqueta: 'fotos a la vez' },
    { valor: '0', etiqueta: 'registros' },
  ];

  protected readonly PRENDAS_CINTA = [
    'Outfit completo', 'Playera', 'Camisa', 'Blusa', 'Top', 'Suéter', 'Sudadera', 'Chamarra', 'Saco', 'Abrigo',
    'Pantalón', 'Jeans', 'Pants', 'Leggings', 'Short', 'Falda', 'Vestido', 'Tenis', 'Zapatos', 'Botas', 'Sandalias',
  ];

  protected readonly PASOS: Array<{ titulo: string; texto: string; icono: SafeHtml }> = [
    {
      titulo: 'Sube una foto tuya',
      texto: 'De cuerpo entero y de frente. Se guarda en privado y puedes tener varias.',
      icono: this.html(icono('M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z')),
    },
    {
      titulo: 'Sube fotos de tu ropa',
      texto: 'Varias a la vez. Quitamos el fondo, detectamos el tipo y te preguntamos cómo te queda.',
      icono: this.html(icono('M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5')),
    },
    {
      titulo: 'Genera tu prueba',
      texto: 'Elige hasta cuatro prendas y la IA crea una foto tuya con ellas puestas.',
      icono: this.html(icono('M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z')),
    },
  ];

  protected readonly PARTES_DEMO = [
    { nombre: 'Arriba', detalle: 'Playera oliva', activa: true },
    { nombre: 'Abajo', detalle: 'Jeans', activa: false },
    { nombre: 'Calzado', detalle: 'Tenis negros', activa: true },
  ];

  protected readonly DETECCIONES = [
    { icono: '◐', titulo: 'Tipo de prenda', texto: 'Playera, camisa, sudadera, chamarra, pants, jeans, falda, vestido, tenis y más.' },
    { icono: '⌃', titulo: 'Detalles', texto: 'Capucha, cierre o botones, manga corta, 3/4 o larga, puños de pants.' },
    { icono: '◍', titulo: 'Colores y estampado', texto: 'Color principal y secundario; liso, rayas o estampado. Los logos se conservan.' },
  ];

  protected readonly CARACTERISTICAS: Bloque[] = [
    {
      titulo: 'Fotos realistas con IA',
      texto: 'La IA respeta tu cara, tu cuerpo, tu pose y el fondo de tu foto, y viste la ropa con pliegues y sombras naturales.',
      icono: 'M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z',
      grande: true,
      oscura: true,
    },
    {
      titulo: 'Cuestionario por prenda',
      texto: 'Ajustada, regular u holgada; largo; manga; capucha y cuello.',
      icono: 'M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75',
    },
    {
      titulo: 'Fotos caseras',
      texto: 'Recortamos la prenda aunque el fondo sea la pared, el piso o la cama.',
      icono: 'M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5z',
    },
    {
      titulo: 'Historial y descarga',
      texto: 'Compara con tu foto original, descarga el resultado o repite las prendas de una prueba.',
      icono: 'M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3',
    },
    {
      titulo: 'Mujer y Hombre por separado',
      texto: 'Dos armarios independientes para no mezclar prendas.',
      icono: 'M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0z',
    },
    {
      titulo: 'Sin registro',
      texto: 'Entras y empiezas. Tu sesión se crea sola y tu armario se conserva.',
      icono: 'M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z',
    },
  ];

  protected readonly CONSEJOS = [
    {
      titulo: 'Tu foto',
      items: [
        { bien: true, titulo: 'Cuerpo entero y de frente', texto: 'De la cabeza a los pies, con los brazos un poco separados del cuerpo.' },
        { bien: true, titulo: 'Luz de frente', texto: 'Luz natural o una lámpara frente a ti; sin contraluz ni filtros.' },
        { bien: false, titulo: 'Ropa muy holgada', texto: 'Un abrigo grande esconde tu silueta: mejor ropa sencilla y ajustada.' },
        { bien: false, titulo: 'Varias personas', texto: 'Que solo aparezcas tú en la foto.' },
      ],
    },
    {
      titulo: 'Tu ropa',
      items: [
        { bien: true, titulo: 'Extendida o en gancho', texto: 'Estírala sobre la cama o cuélgala, con las mangas a la vista.' },
        { bien: true, titulo: 'Fondo que contraste', texto: 'Una prenda clara sobre fondo oscuro o al revés; así el recorte sale limpio.' },
        { bien: false, titulo: 'Doblada', texto: 'Si está doblada no vemos las mangas ni el largo.' },
        { bien: false, titulo: 'Del mismo color que el fondo', texto: 'Una playera blanca sobre una pared blanca no se puede separar.' },
      ],
    },
  ];

  protected readonly PRIVACIDAD = [
    { numero: '01', titulo: 'Carpeta privada', texto: 'Tus fotos no están en ninguna dirección pública; solo se ven con tu sesión.' },
    { numero: '02', titulo: 'Sin metadatos', texto: 'Antes de subirlas les quitamos la ubicación y otros datos de la cámara.' },
    { numero: '03', titulo: 'Borra cuando quieras', texto: 'Tus fotos, tus prendas y tus pruebas se borran con un clic.' },
    { numero: '04', titulo: 'Sin registro', texto: 'No pedimos correo ni contraseña para usar el probador.' },
  ];

  protected readonly PIE: Array<{ titulo: string; enlaces: Array<[string, string]> }> = [
    { titulo: 'Probador', enlaces: [['Empezar', '#probador'], ['Cómo funciona', '#como-funciona'], ['Outfits', '#outfits']] },
    { titulo: 'Producto', enlaces: [['Características', '#caracteristicas'], ['Consejos de foto', '#consejos']] },
    { titulo: 'Ayuda', enlaces: [['Privacidad', '#privacidad'], ['Preguntas frecuentes', '#preguntas']] },
  ];

  verTutorial(): void {
    document.getElementById('probador')?.scrollIntoView({ behavior: 'smooth' });
    setTimeout(() => this.tutorial.iniciar(), 450);
  }

  private html(svg: string): SafeHtml {
    // SVG estático definido en este archivo (no viene del usuario).
    return this.sanitizer.bypassSecurityTrustHtml(svg);
  }
}
