import { Component } from '@angular/core';
import { AvatarSetupComponent } from './avatar-setup/avatar-setup';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [AvatarSetupComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class AppComponent {
  title = 'trender-frontend';
}