import { TestBed } from '@angular/core/testing';

import { TutorialComponent } from './tutorial';
import { PASOS_TUTORIAL, TutorialService } from './tutorial.service';

describe('TutorialService', () => {
  beforeEach(() => localStorage.clear());

  it('recorre los pasos y recuerda que se vio', () => {
    const t = TestBed.inject(TutorialService);
    expect(t.visto()).toBe(false);
    t.iniciarSiEsNuevo();
    expect(t.activo()).toBe(true);
    expect(t.paso().objetivo).toBe('persona');
    for (let i = 0; i < PASOS_TUTORIAL.length; i++) t.siguiente();
    expect(t.activo()).toBe(false);
    expect(t.visto()).toBe(true);
    t.iniciarSiEsNuevo();
    expect(t.activo()).toBe(false);
  });

  it('anterior no baja de cero y "?" lo reinicia', () => {
    const t = TestBed.inject(TutorialService);
    t.iniciar();
    t.anterior();
    expect(t.indice()).toBe(0);
    t.siguiente();
    t.terminar();
    t.iniciar();
    expect(t.indice()).toBe(0);
    expect(t.activo()).toBe(true);
  });
});

describe('TutorialComponent', () => {
  beforeEach(() => localStorage.clear());

  it('muestra la tarjeta del paso y permite saltar', async () => {
    const fixture = TestBed.createComponent(TutorialComponent);
    const t = TestBed.inject(TutorialService);
    t.iniciar();
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Paso 1 de');
    expect(el.textContent).toContain(PASOS_TUTORIAL[0].titulo);
    const saltar = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Saltar'))!;
    saltar.click();
    await fixture.whenStable();
    expect(t.activo()).toBe(false);
    expect(el.querySelector('[role="dialog"]')).toBeNull();
  });
});
