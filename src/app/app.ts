import { Component } from '@angular/core';
import { JarvisComponent } from './features/jarvis/jarvis.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [JarvisComponent],
  template: '<app-jarvis></app-jarvis>',
  styles: [':host { display: block; width: 100%; height: 100vh; }'],
})
export class App {}
