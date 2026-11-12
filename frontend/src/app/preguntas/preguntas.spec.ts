import { TestBed } from '@angular/core/testing';

import { PREGUNTAS, PreguntasComponent } from './preguntas';

describe('PreguntasComponent', () => {
  it('abre una respuesta a la vez', async () => {
    const fixture = TestBed.createComponent(PreguntasComponent);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    const botones = el.querySelectorAll<HTMLButtonElement>('.pregunta button');
    expect(botones.length).toBe(PREGUNTAS.length);
    expect(el.querySelectorAll('.respuesta').length).toBe(1);

    botones[2].click();
    await fixture.whenStable();
    expect(botones[2].getAttribute('aria-expanded')).toBe('true');
    expect(botones[0].getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('.respuesta')?.textContent).toContain(PREGUNTAS[2].respuesta.slice(0, 20));

    botones[2].click();
    await fixture.whenStable();
    expect(el.querySelectorAll('.respuesta').length).toBe(0);
  });
});
