import { TestBed } from '@angular/core/testing';

import { MEDIDAS_INICIALES } from '../probador/cuerpo';
import { Visor3dComponent } from './visor-3d';

describe('Visor3dComponent', () => {
  it('muestra un aviso en lugar de fallar si no hay WebGL', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fixture = TestBed.createComponent(Visor3dComponent);
    fixture.componentRef.setInput('medidas', MEDIDAS_INICIALES.Femenino);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('WebGL');
    fixture.destroy();
  });
});
