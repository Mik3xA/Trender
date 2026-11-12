import { ApplicationConfig } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

import { sesionInterceptor } from './servicios/sesion.service';

export const appConfig: ApplicationConfig = {
  providers: [provideHttpClient(withInterceptors([sesionInterceptor]))],
};
