import { Component } from '@angular/core';
import { CommonModule } from '@angular/common'; // Necesario para ngIf

@Component({
  selector: 'app-avatar-setup',
  standalone: true,
  imports: [CommonModule], 
  templateUrl: './avatar-setup.html',
  styleUrl: './avatar-setup.scss'
})
export class AvatarSetupComponent {
  isGenerating = false;
  modelReady = false;

  generarModelo() {
    this.isGenerating = true;
    
    // Simula una espera de 3 segundos del motor 3D
    setTimeout(() => {
      this.isGenerating = false;
      this.modelReady = true;
    }, 3000);
  }
}