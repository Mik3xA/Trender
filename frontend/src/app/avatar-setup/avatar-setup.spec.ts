import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AvatarSetup } from './avatar-setup';

describe('AvatarSetup', () => {
  let component: AvatarSetup;
  let fixture: ComponentFixture<AvatarSetup>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AvatarSetup],
    }).compileComponents();

    fixture = TestBed.createComponent(AvatarSetup);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
