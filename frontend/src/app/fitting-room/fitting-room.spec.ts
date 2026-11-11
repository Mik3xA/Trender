import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FittingRoom } from './fitting-room';

describe('FittingRoom', () => {
  let component: FittingRoom;
  let fixture: ComponentFixture<FittingRoom>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FittingRoom],
    }).compileComponents();

    fixture = TestBed.createComponent(FittingRoom);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
