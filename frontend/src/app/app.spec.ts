import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { AppComponent } from './app';

describe('AppComponent', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  it('muestra la página con probador, cómo funciona y preguntas frecuentes', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    for (const id of ['inicio', 'probador', 'como-funciona', 'caracteristicas', 'preguntas']) {
      expect(el.querySelector('#' + id)).not.toBeNull();
    }
    expect(el.querySelector('#probador app-avatar-setup')).not.toBeNull();
    expect(el.textContent).toContain('Preguntas frecuentes');
    expect(el.textContent).toContain('Probar ahora');
  });
});
