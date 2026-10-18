import { Component, ChangeDetectorRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common'; // Necesario para ngIf
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';

const WEBHOOK_URL = 'http://localhost:3000/webhooks/recibir';
const DEFAULT_CUSTOMER_EMAIL = 'usuario@trender.com';

interface AvatarImage {
  src: string;
  alt: string;
}

@Component({
  selector: 'app-avatar-setup',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './avatar-setup.html',
  styleUrl: './avatar-setup.scss'
})
export class AvatarSetupComponent implements OnInit {
  estatura: number | null = null;
  peso: number | null = null;
  complexion: string = 'Atlética';

  isGenerating = false;
  modelReady = false;
  avatarImage: AvatarImage | null = null;

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.avatarImage = this.getAvatarImageByComplexion(this.complexion);
  }

  getAvatarImageByComplexion(complexion: string): AvatarImage {
    switch (complexion) {
      case 'Delgada':
        return {
          src: 'https://images.unsplash.com/photo-1609487991251-631b9ad8aa22?q=80&w=1374&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
          alt: 'Avatar 3D - Complexión delgada'
        };
      case 'Atlética':
        return {
          src: 'https://images.unsplash.com/photo-1694138131966-1e2968d4c417?q=80&w=1374&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
          alt: 'Avatar 3D - Complexión atlética'
        };
      case 'Media':
        return {
          src: 'https://images.unsplash.com/photo-1595528983402-29309066b18f?q=80&w=1374&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
          alt: 'Avatar 3D - Complexión media'
        };
      case 'Robusta':
        return {
          src: 'https://images.unsplash.com/photo-1598974357801-cbca100e65d3?q=80&w=1374&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
          alt: 'Avatar 3D - Complexión robusta'
        };
      default:
        return {
          src: 'https://images.unsplash.com/photo-1609487991251-631b9ad8aa22?q=80&w=1374&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
          alt: 'Avatar 3D - Trender'
        };
    }
  }

  onComplexionChange(): void {
    this.avatarImage = this.getAvatarImageByComplexion(this.complexion);
  }

  generarModelo(): void {
    if (!this.estatura || !this.peso) {
      alert('Ingresa estatura y peso');
      return;
    }

    this.isGenerating = true;
    this.modelReady = false;
    this.avatarImage = this.getAvatarImageByComplexion(this.complexion);

    const payload = {
      transaction_id: crypto.randomUUID(),
      amount: 100,
      customer_email: DEFAULT_CUSTOMER_EMAIL,
      currency: 'USD',
      avatar_data: {
        estatura: this.estatura,
        peso: this.peso,
        complexion: this.complexion
      }
    };

    this.http.post(WEBHOOK_URL, payload).subscribe({
      next: (respuesta) => {
        console.log('Webhook procesado en backend:', respuesta);
        this.isGenerating = false;
        this.modelReady = true;
        this.cdr.detectChanges();
      },
      error: (err: HttpErrorResponse) => {
        const mensaje = err.error?.error ?? err.message;
        console.error(`Backend respondió ${err.status}: ${mensaje}`);
        const detalles = err.error?.errors;
        if (Array.isArray(detalles)) {
          for (const detalle of detalles) {
            if (typeof detalle === 'string') {
              console.error(` - ${detalle}`);
            } else {
              console.error(` - ${detalle.field}: ${detalle.message}`);
            }
          }
        }
        this.isGenerating = false;
        this.cdr.detectChanges();
      }
    });
  }
}
