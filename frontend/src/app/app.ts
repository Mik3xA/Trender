import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { AvatarSetupComponent } from './avatar-setup/avatar-setup';
import { ComparadorComponent } from './comparador/comparador';
import { PreguntasComponent } from './preguntas/preguntas';
import { TutorialComponent } from './tutorial/tutorial';
import { TutorialService } from './tutorial/tutorial.service';

interface Bloque {
  titulo: string;
  texto: string;
  icono: string;
}

/** Página: portada, probador embebido, cómo funciona, características, preguntas y pie. */
@Component({
  selector: 'app-root',
  imports: [AvatarSetupComponent, ComparadorComponent, PreguntasComponent, TutorialComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class AppComponent {
  private readonly tutorial = inject(TutorialService);
  protected readonly anio = new Date().getFullYear();

  protected readonly CIFRAS = [
    { valor: '20', etiqueta: 'tipos de prenda' },
    { valor: '6', etiqueta: 'fotos a la vez' },
    { valor: '0', etiqueta: 'registros' },
  ];

  protected readonly PRENDAS_CINTA = [
    'Playera', 'Camisa', 'Blusa', 'Top', 'Suéter', 'Sudadera', 'Chamarra', 'Saco', 'Abrigo',
    'Pantalón', 'Jeans', 'Pants', 'Leggings', 'Short', 'Falda', 'Vestido', 'Tenis', 'Zapatos', 'Botas', 'Sandalias',
  ];

  protected readonly DETECCIONES = [
    { icono: '◐', titulo: 'Tipo de prenda', texto: 'Superior, inferior, vestido o calzado y el tipo concreto.' },
    { icono: '⌒', titulo: 'Mangas y largo', texto: 'Sin manga, corta, 3/4 o larga; corta, a la cadera o larga.' },
    { icono: '◍', titulo: 'Colores y estampado', texto: 'Color principal y secundario con nombre; liso, rayas o estampado.' },
    { icono: '⌃', titulo: 'Detalles', texto: 'Capucha, cierre o botones al frente, puños de pants, caña de bota.' },
  ];

  protected readonly FICHA_DEMO: Array<[string, string]> = [
    ['Tipo', 'Sudadera'],
    ['Manga', 'Larga'],
    ['Colores', 'Gris · blanco'],
    ['Estampado', 'Liso'],
  ];

  protected readonly CONSEJOS = [
    { bien: true, titulo: 'Fondo liso', texto: 'Una pared, el piso o una sábana de un solo color que contraste con la prenda.', fondo: '#ffffff', prenda: '#5f6b38', giro: 0, persona: false },
    { bien: true, titulo: 'Extendida y de frente', texto: 'Estírala sobre la cama o cuélgala de un gancho, con las mangas a la vista.', fondo: '#ece7dd', prenda: '#1f2a44', giro: 0, persona: false },
    { bien: false, titulo: 'Puesta en una persona', texto: 'Con brazos y cuello a la vista el recorte se confunde: mejor la prenda sola.', fondo: '#d8d2c8', prenda: '#b3282d', giro: 0, persona: true },
    { bien: false, titulo: 'Doblada o de lado', texto: 'Si está doblada no vemos las mangas ni el largo y la clasificación falla.', fondo: '#a77b52', prenda: '#7d7d7a', giro: 28, persona: false },
  ];

  protected readonly USOS = [
    { numero: '01', titulo: 'Antes de comprar', texto: 'Toma la foto de la prenda en la tienda y mírala con lo que ya tienes.' },
    { numero: '02', titulo: 'Arma outfits', texto: 'Combina superior, inferior y calzado de tu propio armario.' },
    { numero: '03', titulo: 'Compara tallas', texto: 'Mira cómo cambia una prenda ajustada, regular u holgada.' },
    { numero: '04', titulo: 'Para otra persona', texto: 'Los apartados Mujer y Hombre guardan cuerpo y armario por separado.' },
  ];

  protected readonly PIE: Array<{ titulo: string; enlaces: Array<[string, string]> }> = [
    { titulo: 'Probador', enlaces: [['Subir prenda', '#probador'], ['Tutorial', '#como-funciona'], ['Consejos de foto', '#consejos']] },
    { titulo: 'Producto', enlaces: [['Análisis', '#analisis'], ['Características', '#caracteristicas'], ['Para qué sirve', '#usos']] },
    { titulo: 'Ayuda', enlaces: [['Preguntas frecuentes', '#preguntas'], ['Cómo funciona', '#como-funciona']] },
  ];

  protected readonly PASOS: Array<{ titulo: string; texto: string }> = [
    { titulo: 'Elige Mujer u Hombre', texto: 'Cada apartado tiene su propio avatar y su propio armario.' },
    { titulo: 'Ajusta tu cuerpo', texto: 'Altura, peso y tipo de cuerpo. Las medidas exactas son opcionales.' },
    { titulo: 'Sube la foto de la prenda', texto: 'Quitamos el fondo y detectamos el tipo, las mangas, el color y el estampado.' },
    { titulo: 'Responde y pruébatela', texto: 'Confirma qué es y cómo te queda; gira el avatar y mira tu talla.' },
  ];

  protected readonly CARACTERISTICAS: Bloque[] = [
    {
      titulo: 'Tu ropa, de verdad',
      texto: 'Sube fotos de tus prendas: quitamos el fondo y las ponemos en el avatar con pliegues y caída de tela.',
      icono: 'M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244',
    },
    {
      titulo: 'Un avatar con tu cuerpo',
      texto: 'Fit, delgado, normal o sobrepeso, con tu altura, peso y tono de piel.',
      icono: 'M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z',
    },
    {
      titulo: 'Talla recomendada',
      texto: 'Comparamos tus medidas con tablas de tallas para cada prenda puesta.',
      icono: 'M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125z',
    },
    {
      titulo: 'Mujer y Hombre por separado',
      texto: 'Dos armarios independientes para preparar looks sin mezclarlos.',
      icono: 'M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0z',
    },
    {
      titulo: 'Sin registro',
      texto: 'Entras y empiezas. Tu sesión se crea sola y tu armario se conserva.',
      icono: 'M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z',
    },
    {
      titulo: 'Privado',
      texto: 'No pedimos fotos tuyas ni datos personales. Borra prendas cuando quieras.',
      icono: 'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z',
    },
  ];

  verTutorial(): void {
    document.getElementById('probador')?.scrollIntoView({ behavior: 'smooth' });
    setTimeout(() => this.tutorial.iniciar(), 400);
  }
}
