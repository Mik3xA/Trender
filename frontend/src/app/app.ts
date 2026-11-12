import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { AvatarSetupComponent } from './avatar-setup/avatar-setup';
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
  imports: [AvatarSetupComponent, PreguntasComponent, TutorialComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class AppComponent {
  private readonly tutorial = inject(TutorialService);
  protected readonly anio = new Date().getFullYear();

  protected readonly TIENDAS = ['Amazon', 'Mercado Libre', 'Nike', 'Zara', 'H&M'];

  protected readonly PASOS: Array<{ titulo: string; texto: string }> = [
    { titulo: 'Elige Mujer u Hombre', texto: 'Cada apartado tiene su propio avatar y su propio armario.' },
    { titulo: 'Ajusta tu cuerpo', texto: 'Altura, peso y tipo de cuerpo. Las medidas exactas son opcionales.' },
    { titulo: 'Sube la foto de la prenda', texto: 'O pega el link de la tienda. Detectamos el tipo, el color y el estampado.' },
    { titulo: 'Pruébatela y elige talla', texto: 'Gira el avatar, combina prendas y mira la talla recomendada.' },
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
