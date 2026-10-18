import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { AvatarSetupComponent } from './avatar-setup';

describe('AvatarSetupComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AvatarSetupComponent],
      providers: [provideHttpClient()],
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(AvatarSetupComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });
});
